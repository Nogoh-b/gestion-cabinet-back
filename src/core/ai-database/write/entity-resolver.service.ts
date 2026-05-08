// src/core/ai-database/write/entity-resolver.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Like, ILike } from 'typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { BUSINESS_METADATA_KEY, BusinessColumnMetadata } from '../../decorators/business-metadata.decorator';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolveMatch<T> {
  entity: T;
  score: number;       // 0–100
  matchedOn: string;   // ex: "prénom+nom", "email", "entreprise"
}

export interface ResolveResult<T> {
  found: boolean;
  best: T | null;
  score: number;
  matchedOn: string;
  candidates: ResolveMatch<T>[];  // tous les candidats classés
  ambiguous: boolean;             // true si plusieurs candidats proches
}

// ─── Helpers scoring ─────────────────────────────────────────────────────────

/**
 * Normalise une chaîne : minuscules, sans accents, sans ponctuation superflue
 */
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score de similitude entre deux chaînes normalisées (0–100)
 * Combine contenance exacte + distance de Levenshtein légère
 */
function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);

  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;

  // Tokens communs
  const tokensA = new Set(na.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(nb.split(' ').filter(t => t.length > 1));
  const common = [...tokensA].filter(t => tokensB.has(t)).length;
  const tokenScore = common / Math.max(tokensA.size, tokensB.size, 1);

  // Levenshtein simplifié (bigrammes)
  const bigramsA = bigrams(na);
  const bigramsB = bigrams(nb);
  const bigramIntersect = bigramsA.filter(bg => bigramsB.includes(bg)).length;
  const bigramScore =
    (2 * bigramIntersect) / (bigramsA.length + bigramsB.length || 1);

  return Math.round(Math.max(tokenScore, bigramScore) * 80);
}

function bigrams(s: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < s.length - 1; i++) result.push(s.slice(i, i + 2));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EntityResolverService {
  private readonly logger = new Logger(EntityResolverService.name);

  /** Score minimal pour considérer un candidat valide */
  private readonly MIN_SCORE = 40;

  /** Écart max entre le meilleur et le 2ème pour ne pas déclarer ambiguïté */
  private readonly AMBIGUITY_GAP = 15;

  /**
   * Cache des champs "searchable" par table.
   * Déterminés automatiquement depuis les BusinessColumn + heuristiques.
   */
  private searchableFieldsCache = new Map<string, string[]>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  // ─── CLIENT ────────────────────────────────────────────────────────────────

  async resolveCustomer(input: string): Promise<ResolveResult<Customer>> {
    this.logger.debug(`🔍 Résolution client: "${input}"`);

    const ni = normalize(input);
    const parts = ni.split(' ');
    const first = parts[0];
    const rest = parts.slice(1).join(' ');

    // 1. Requête large pour ramener les candidats
    const candidates = await this.customerRepo.find({
      where: [
        { first_name: ILike(`%${first}%`) },
        { last_name: ILike(`%${first}%`) },
        ...(rest ? [
          { first_name: ILike(`%${rest}%`) },
          { last_name: ILike(`%${rest}%`) },
        ] : []),
        { company_name: ILike(`%${input}%`) },
        { email: ILike(`%${input}%`) },
      ],
      take: 20,
    });

    if (candidates.length === 0) {
      // 2. Fallback : requête encore plus large token par token
      const fallback = await this.broadCustomerSearch(parts);
      candidates.push(...fallback);
    }

    // 3. Scorer chaque candidat
    const scored = this.scoreCustomers(input, candidates);

    return this.buildResult(scored, input, 'client');
  }

  private scoreCustomers(input: string, rows: Customer[]): ResolveMatch<Customer>[] {
    return rows
      .map(c => {
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const reverseName = `${c.last_name ?? ''} ${c.first_name ?? ''}`.trim();

        const scores: { score: number; label: string }[] = [
          { score: similarityScore(input, fullName),        label: 'prénom+nom' },
          { score: similarityScore(input, reverseName),     label: 'nom+prénom' },
          { score: similarityScore(input, c.first_name),   label: 'prénom' },
          { score: similarityScore(input, c.last_name),    label: 'nom' },
          { score: similarityScore(input, c.company_name), label: 'entreprise' },
          { score: similarityScore(input, c.email),        label: 'email' },
          // Bonus si l'email contient un token du nom
          ...(input.includes('@') ? [{ score: c.email?.toLowerCase().includes(normalize(input)) ? 95 : 0, label: 'email exact' }] : []),
        ];

        const best = scores.reduce((a, b) => a.score >= b.score ? a : b);

        return { entity: c, score: best.score, matchedOn: best.label };
      })
      .filter(m => m.score >= this.MIN_SCORE)
      .sort((a, b) => b.score - a.score);
  }

  private async broadCustomerSearch(tokens: string[]): Promise<Customer[]> {
    // Cherche n'importe quel token dans tous les champs texte
    const conditions = tokens.flatMap(t => [
      { first_name: ILike(`%${t}%`) },
      { last_name: ILike(`%${t}%`) },
      { company_name: ILike(`%${t}%`) },
    ]);

    return this.customerRepo.find({ where: conditions, take: 20 });
  }

  // ─── EMPLOYÉ (AVOCAT) ──────────────────────────────────────────────────────

  async resolveEmployee(input: string): Promise<ResolveResult<Employee>> {
    this.logger.debug(`🔍 Résolution employé: "${input}"`);

    const ni = normalize(input);
    const parts = ni.split(' ');
    const first = parts[0];
    const rest = parts.slice(1).join(' ');

    // 1. Requête large via QueryBuilder (join avec user)
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'u')
      .where('1=1');

    // Construire les conditions OR dynamiquement
    const orConditions: string[] = [];
    const params: Record<string, string> = {};

    orConditions.push('LOWER(u.first_name) LIKE :f0', 'LOWER(u.last_name) LIKE :f0');
    params['f0'] = `%${first}%`;

    if (rest) {
      orConditions.push('LOWER(u.first_name) LIKE :r0', 'LOWER(u.last_name) LIKE :r0');
      params['r0'] = `%${rest}%`;
    }

    orConditions.push('LOWER(e.specialization) LIKE :full');
    params['full'] = `%${ni}%`;

    // Token par token pour la spécialisation
    parts.forEach((p, i) => {
      orConditions.push(`LOWER(e.specialization) LIKE :sp${i}`);
      params[`sp${i}`] = `%${p}%`;
    });

    qb.andWhere(`(${orConditions.join(' OR ')})`, params);
    qb.take(20);

    const candidates = await qb.getMany();

    // 2. Scorer
    const scored = this.scoreEmployees(input, candidates);

    return this.buildResult(scored, input, 'employé');
  }

  private scoreEmployees(input: string, rows: Employee[]): ResolveMatch<Employee>[] {
    return rows
      .map(e => {
        const user = (e as any).user;
        const firstName = user?.first_name ?? '';
        const lastName  = user?.last_name  ?? '';
        const fullName  = `${firstName} ${lastName}`.trim();
        const reverseName = `${lastName} ${firstName}`.trim();

        const scores: { score: number; label: string }[] = [
          { score: similarityScore(input, fullName),         label: 'prénom+nom' },
          { score: similarityScore(input, reverseName),      label: 'nom+prénom' },
          { score: similarityScore(input, firstName),        label: 'prénom' },
          { score: similarityScore(input, lastName),         label: 'nom' },
          { score: similarityScore(input, e.specialization), label: 'spécialisation' },
          { score: similarityScore(input, e.bar_association_city), label: 'ville barreau' },
        ];

        const best = scores.reduce((a, b) => a.score >= b.score ? a : b);

        return { entity: e, score: best.score, matchedOn: best.label };
      })
      .filter(m => m.score >= this.MIN_SCORE)
      .sort((a, b) => b.score - a.score);
  }

  // ─── RÉSOLUTION GÉNÉRIQUE PAR NOM DE TABLE ─────────────────────────────────

  /**
   * Point d'entrée principal pour BaseWriteHandler et le système générique.
   * Résout N'IMPORTE QUELLE entité à partir de son nom de table et d'un terme de recherche.
   *
   * Stratégie :
   *  1. Si un resolver spécialisé existe (customer, employee) → l'utiliser
   *  2. Sinon → résolution générique via TypeORM metadata + BusinessColumn
   *
   * Les champs de recherche sont déterminés automatiquement :
   *  - Champs avec importance "critical" ou "high" dans @BusinessColumn
   *  - Champs dont le nom contient : name, nom, prenom, first_name, last_name,
   *    code, email, label, title, libelle, numero, number, reference, sigle
   *  - Colonnes de type varchar/text uniquement (pas int, date, etc.)
   */
  async resolveAnyEntity(
    tableName: string,
    searchTerm: string,
  ): Promise<ResolveResult<any>> {
    this.logger.debug(`🔍 resolveAnyEntity("${tableName}", "${searchTerm}")`);

    // ── 1. Resolvers spécialisés ──
    if (tableName === 'customer' || tableName === 'customers') {
      return this.resolveCustomer(searchTerm);
    }
    if (tableName === 'employee' || tableName === 'employees') {
      return this.resolveEmployee(searchTerm);
    }

    // ── 2. Résolution générique ──
    const entityMeta = this.dataSource.entityMetadatas.find(
      m => m.tableName === tableName,
    );
    if (!entityMeta) {
      this.logger.warn(`❌ Table inconnue: ${tableName}`);
      return { found: false, best: null, score: 0, matchedOn: '', candidates: [], ambiguous: false };
    }

    const repo = this.dataSource.getRepository(entityMeta.target);
    const searchFields = this.getSearchableFields(entityMeta);

    if (searchFields.length === 0) {
      this.logger.warn(`⚠️ Aucun champ searchable trouvé pour "${tableName}"`);
      return { found: false, best: null, score: 0, matchedOn: '', candidates: [], ambiguous: false };
    }

    const ni = normalize(searchTerm);
    const tokens = ni.split(' ').filter(t => t.length > 0);

    // Construire les conditions WHERE : chaque token × chaque champ
    const conditions = searchFields.flatMap(field =>
      tokens.map(token => ({ [field]: ILike(`%${token}%`) } as any)),
    );

    let candidates: any[];
    try {
      candidates = await repo.find({ where: conditions, take: 30 });
    } catch (err) {
      this.logger.warn(`⚠️ Erreur recherche sur "${tableName}": ${(err as Error).message}`);
      candidates = [];
    }

    // Si aucun résultat, tenter une recherche encore plus large (premier token uniquement)
    if (candidates.length === 0 && tokens.length > 1) {
      const broadConditions = searchFields.map(field =>
        ({ [field]: ILike(`%${tokens[0]}%`) } as any),
      );
      try {
        candidates = await repo.find({ where: broadConditions, take: 30 });
      } catch {
        candidates = [];
      }
    }

    // Scorer chaque candidat sur TOUS les champs searchable
    const scored: ResolveMatch<any>[] = candidates
      .map(entity => {
        let bestScore = 0;
        let bestField = '';

        for (const field of searchFields) {
          const fieldValue = String(entity[field] ?? '');
          const score = similarityScore(searchTerm, fieldValue);
          if (score > bestScore) {
            bestScore = score;
            bestField = field;
          }
        }

        // Score composite : combinaison de tous les champs searchable
        const combinedText = searchFields
          .map(f => String(entity[f] ?? ''))
          .join(' ');
        const combinedScore = similarityScore(searchTerm, combinedText);

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestField = searchFields.join('+');
        }

        return {
          entity,
          score: bestScore,
          matchedOn: `${bestField}: ${String(entity[bestField.split('+')[0]] ?? '').slice(0, 50)}`,
        };
      })
      .filter(m => m.score >= this.MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    return this.buildResult(scored, searchTerm, tableName);
  }

  /**
   * Détermine les champs "searchable" d'une entité automatiquement.
   * Résultat mis en cache pour performance.
   */
  private getSearchableFields(entityMeta: import('typeorm').EntityMetadata): string[] {
    const tableName = entityMeta.tableName;

    if (this.searchableFieldsCache.has(tableName)) {
      return this.searchableFieldsCache.get(tableName)!;
    }

    const fields: string[] = [];
    const prototype = (entityMeta.target as Function).prototype;

    // Patterns de noms de colonnes "naturellement searchable"
    const SEARCHABLE_PATTERNS = [
      /name/i, /nom/i, /prenom/i, /first.?name/i, /last.?name/i,
      /code/i, /email/i, /label/i, /title/i, /titre/i,
      /libelle/i, /numero/i, /number/i, /reference/i, /ref/i,
      /sigle/i, /abbreviation/i, /designation/i, /intitule/i,
      /company/i, /entreprise/i, /raison.?sociale/i,
      /description/i, /phone/i, /telephone/i,
    ];

    // Types de colonnes textuelles
    const TEXT_TYPES = new Set([
      'varchar', 'text', 'char', 'tinytext', 'mediumtext', 'longtext',
      'character varying', 'nvarchar', 'nchar', String,
    ]);

    for (const column of entityMeta.columns) {
      const dbName = column.databaseName;
      const propName = column.propertyName;

      // Ignorer les colonnes système
      if (['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by', 'deleted_by', 'password', 'token', 'secret'].includes(dbName)) {
        continue;
      }

      // Vérifier que c'est un type texte
      const colType = String(column.type).toLowerCase();
      const isText = TEXT_TYPES.has(colType) || colType === 'string' || column.type === String;
      if (!isText) continue;

      // Vérifier via @BusinessColumn
      let bCol: BusinessColumnMetadata | undefined;
      try {
        bCol = Reflect.getMetadata(BUSINESS_METADATA_KEY, prototype, propName) as BusinessColumnMetadata;
      } catch { /* ignore */ }

      if (bCol?.ignored || bCol?.sensitive) continue;

      // Priorité 1 : importance "critical" ou "high" → toujours searchable
      if (bCol?.importance === 'critical' || bCol?.importance === 'high') {
        fields.push(propName);
        continue;
      }

      // Priorité 2 : nom de colonne match un pattern searchable
      if (SEARCHABLE_PATTERNS.some(p => p.test(dbName) || p.test(propName))) {
        fields.push(propName);
        continue;
      }

      // Priorité 3 : format email/phone → searchable
      if (bCol?.format === 'email' || bCol?.format === 'phone') {
        fields.push(propName);
        continue;
      }
    }

    // Fallback : si aucun champ trouvé, prendre TOUTES les colonnes textuelles non-système
    if (fields.length === 0) {
      for (const column of entityMeta.columns) {
        const colType = String(column.type).toLowerCase();
        const isText = TEXT_TYPES.has(colType) || colType === 'string' || column.type === String;
        const isSystem = ['id', 'created_at', 'updated_at', 'deleted_at', 'password', 'token'].includes(column.databaseName);
        if (isText && !isSystem) {
          fields.push(column.propertyName);
        }
      }
    }

    this.logger.debug(
      `📋 Champs searchable pour "${tableName}": [${fields.join(', ')}]`,
    );

    this.searchableFieldsCache.set(tableName, fields);
    return fields;
  }

  // ─── RÉSOLUTION PAR CHAMPS EXPLICITES (API directe) ───────────────────────

  /**
   * Résoudre une entité par des champs texte arbitraires.
   * API directe pour les handlers custom qui connaissent leurs champs.
   */
  async resolveByFields<T extends object>(
    repo: Repository<T>,
    input: string,
    searchFields: (keyof T)[],
    labelFields: (keyof T)[],
  ): Promise<ResolveResult<T>> {
    const ni = normalize(input);
    const tokens = ni.split(' ');

    // Construire les conditions WHERE dynamiquement
    const conditions = searchFields.flatMap(field =>
      tokens.map(token => ({ [field]: ILike(`%${token}%`) } as any))
    );

    const candidates = await repo.find({ where: conditions, take: 20 });

    const scored: ResolveMatch<T>[] = candidates
      .map(entity => {
        const texts = labelFields.map(f => String((entity as any)[f] ?? ''));
        const combined = texts.join(' ');
        const score = similarityScore(input, combined);
        return { entity, score, matchedOn: combined.slice(0, 40) };
      })
      .filter(m => m.score >= this.MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    return this.buildResult(scored, input, repo.metadata.tableName);
  }

  // ─── BUILDER DE RÉSULTAT ──────────────────────────────────────────────────

  private buildResult<T>(
    scored: ResolveMatch<T>[],
    input: string,
    entityLabel: string,
  ): ResolveResult<T> {
    if (scored.length === 0) {
      this.logger.warn(`❌ Aucun ${entityLabel} trouvé pour "${input}"`);
      return { found: false, best: null, score: 0, matchedOn: '', candidates: [], ambiguous: false };
    }

    const best = scored[0];
    const second = scored[1];
    const ambiguous =
      !!second && (best.score - second.score) < this.AMBIGUITY_GAP && best.score < 90;

    if (ambiguous) {
      this.logger.warn(
        `⚠️ Ambiguïté détectée pour "${input}": ` +
        scored.slice(0, 3).map(s => `${s.matchedOn}(${s.score})`).join(', ')
      );
    } else {
      this.logger.log(
        `✅ ${entityLabel} résolu: "${input}" → score ${best.score} via "${best.matchedOn}"`,
      );
    }

    return {
      found: true,
      best: best.entity,
      score: best.score,
      matchedOn: best.matchedOn,
      candidates: scored,
      ambiguous,
    };
  }
}
