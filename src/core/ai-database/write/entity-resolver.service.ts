// src/core/ai-database/write/entity-resolver.service.ts
import { DataSource, ILike, Repository } from 'typeorm';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';


import { BUSINESS_METADATA_KEY, BusinessColumnMetadata } from '../../decorators/business-metadata.decorator';
import { AI_DATABASE_PROJECT_CONFIG } from '../ai-database.tokens';
import { AiDatabaseProjectConfig } from '../interfaces/ai-database-project-config.interface';



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

/**
 * Mode de résolution des ambiguïtés.
 * - STRICT : (actuel) lève une erreur si ambiguïté détectée
 * - BEST_EFFORT : prend automatiquement le meilleur score même si ambigu
 */
export enum ResolveMode {
  STRICT = 'strict',
  BEST_EFFORT = 'best_effort',
}

/**
 * Configuration de résolution passée en paramètre.
 * Permet de contrôler finement le comportement sans créer plusieurs méthodes.
 */
export interface ResolveConfig {
  mode?: ResolveMode;
  /** Score minimum pour considérer un candidat valide (défaut: 40) */
  minScore?: number;
  /**
   * Écart minimum entre le 1er et 2ème score pour ne PAS déclarer ambiguïté.
   * Plus la valeur est petite, plus on tolère des scores proches.
   * Mettre à 0 pour BEST_EFFORT (toujours prendre le meilleur).
   * Défaut: 15
   */
  ambiguityGap?: number;
}

/**
 * Résultat enrichi pour resolveOrCreateEntity.
 * Contient le résultat de la résolution ET l'entité créée si applicable.
 */
export interface ResolveOrCreateResult<T> {
  resolved: ResolveResult<T>;
  created: boolean;
  newEntity?: T;
  message: string;
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
    @Optional() @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
  ) {}

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
    config?: ResolveConfig,
    additionalFilters?: Record<string, any>,
  ): Promise<ResolveResult<any>> {
    this.logger.debug(`🔍 resolveAnyEntity("${tableName}", "${searchTerm}")`);

    // ── 1. Resolvers spécialisés (injectés via AI_DATABASE_PROJECT_CONFIG) ──
    const specializedResolver = this.projectConfig?.specializedResolvers?.find(
      r => r.tables.includes(tableName),
    );
    if (specializedResolver) {
      return specializedResolver.resolve(searchTerm, config);
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

    // ── 0. Exact match en priorité (codes structurés : DOS-XXXX, REF-XXX, etc.) ──
    const exactEntity = await this.tryExactMatch(repo, searchFields, searchTerm, additionalFilters);
    if (exactEntity) {
      this.logger.log(`✅ Exact match "${searchTerm}" dans "${tableName}" (ID: ${exactEntity.id})`);
      const match: ResolveMatch<any> = { entity: exactEntity, score: 100, matchedOn: `correspondance exacte` };
      return {
        found: true,
        best: exactEntity,
        score: 100,
        matchedOn: 'correspondance exacte',
        candidates: [match],
        ambiguous: false,
      };
    }

    const ni = normalize(searchTerm);
    const tokens = ni.split(' ').filter(t => t.length > 0);

    // Construire les conditions WHERE : chaque token × chaque champ
    // additionalFilters est mergé sur chaque condition (ex: parent_id pour les sous-types)
    const extra = additionalFilters ?? {};
    const conditions = searchFields.flatMap(field =>
      tokens.map(token => ({ [field]: ILike(`%${token}%`), ...extra } as any)),
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
        ({ [field]: ILike(`%${tokens[0]}%`), ...extra } as any),
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
      // Pas de filtre score : on garde tout pour pouvoir retourner des suggestions
      .sort((a, b) => b.score - a.score);

    return this.buildResult(scored, searchTerm, tableName, config);
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

  // ─── RÉSOLUTION AVEC CRÉATION AUTOMATIQUE (CASCADE) ────────────────────────

  /**
   * Résout une entité par son nom, et si introuvable, la crée automatiquement.
   *
   * Utilisé par BaseWriteHandler.resolveDependencies() quand une entité
   * référencée par son nom n'existe pas encore en base.
   *
   * Scénario typique :
   *   - L'utilisateur dit : "Crée un dossier pour Jean Dupont"
   *   - Jean Dupont n'existe pas en base
   *   - Cette méthode crée automatiquement le client "Jean Dupont"
   *   - Retourne l'ID du nouveau client → utilisé pour le dossier
   *
   * @param tableName - Nom de la table (ex: "customer", "employee")
   * @param searchTerm - Texte de recherche (ex: "Jean Dupont")
   * @param userId - ID de l'utilisateur qui fait la demande
   * @param contextFields - Champs additionnels fournis par le handler (optionnel)
   */
  async resolveOrCreateEntity(
    tableName: string,
    searchTerm: string,
    userId: string,
    contextFields?: Record<string, any>,
    config?: ResolveConfig,
    additionalFilters?: Record<string, any>,
  ): Promise<ResolveOrCreateResult<any>> {
    if (!contextFields) contextFields = {};
    this.logger.log(`🔄 resolveOrCreateEntity("${tableName}", "${searchTerm}")`);

    // 1. D'abord, tenter une résolution normale (avec la config passée)
    const resolved = await this.resolveAnyEntity(tableName, searchTerm, config, additionalFilters);

    if (resolved.found && !resolved.ambiguous) {
      // ✅ Trouvé et non ambigu → retourner le résultat
      return {
        resolved,
        created: false,
        message: `${tableName} "${searchTerm}" trouvé(e) (ID: ${(resolved.best as any).id})`,
      };
    }

    if (resolved.ambiguous) {
      // ⚠️ Ambiguïté → on ne crée pas, on laisse l'utilisateur décider
      const suggestions = resolved.candidates
        .slice(0, 3)
        .map(c => `"${c.matchedOn}" (score: ${c.score}%)`)
        .join(', ');
      this.logger.warn(`⚠️ Ambiguïté pour "${searchTerm}" dans ${tableName}: ${suggestions}`);
      return {
        resolved,
        created: false,
        message: `Plusieurs correspondances trouvées pour "${searchTerm}" dans ${tableName}. Veuillez préciser : ${suggestions}`,
      };
    }

    // 🚫 Liste des entités qu'on ne crée JAMAIS automatiquement
    // La liste de base (core générique) + additions du projet via projectConfig
    const NEVER_AUTO_CREATE = new Set<string>([
      'user', 'users', // toujours protégés dans le core
      ...(this.projectConfig?.neverAutoCreate ?? []),
    ]);

    if (NEVER_AUTO_CREATE.has(tableName)) {
      this.logger.warn(`⛔ Création automatique refusée pour "${tableName}" (donnée de référence)`);

      // Chercher les meilleures suggestions sans seuil de score
      // Utilise d'abord les candidats du resolver spécialisé s'ils existent,
      // sinon lance une recherche large (via searchAllCandidates améliorée)
      const allCandidates = resolved.candidates.length > 0
        ? resolved.candidates
        : await this.searchAllCandidates(tableName, searchTerm, additionalFilters);

      const suggestions = allCandidates
        .slice(0, 3)
        .map(c => `"${c.matchedOn}" (${c.score}%)`);

      const entityLabel = tableName;

      let hint = `"${searchTerm}" n'existe pas dans ${tableName}. Vérifiez l'orthographe ou ajoutez-le via l'interface.`;

      if (suggestions.length > 0) {
        hint += ` Résultats proches : ${suggestions.join(', ')}`;
      }

      return {
        resolved: {
          ...resolved,
          candidates: allCandidates, // ← garantir que candidates est rempli pour AmbiguityException
        },
        created: false,
        message: hint,
      };
    }

    // 2. ❌ Non trouvé → créer l'entité automatiquement
    this.logger.log(`➕ Création automatique de "${searchTerm}" dans ${tableName}`);
    try {
      const newEntity = await this.createEntityFromText(tableName, searchTerm, userId, contextFields);
      const entityId = (newEntity as any).id;

      this.logger.log(`✅ Création automatique réussie: ${tableName} "${searchTerm}" → ID ${entityId}`);

      // Retourner un ResolveResult simulé
      const createdResult: ResolveResult<any> = {
        found: true,
        best: newEntity,
        score: 100,
        matchedOn: 'création automatique',
        candidates: [],
        ambiguous: false,
      };

      return {
        resolved: createdResult,
        created: true,
        newEntity,
        message: `${tableName} "${searchTerm}" créé(e) automatiquement (ID: ${entityId})`,
      };
    } catch (error) {
      // ❌ Échec : retourner les candidats de la résolution pour permettre
      //    des suggestions à l'utilisateur au lieu d'une erreur fatale.
      const errMessage = (error as Error).message;
      // Nettoyer les messages d'erreur internes (TypeORM, etc.) pour l'affichage
      const cleanMessage = errMessage.includes('substring')
        ? `Erreur interne lors de la création (contrainte de structure).`
        : errMessage;

      this.logger.error(
        `❌ Échec création automatique de "${searchTerm}" dans ${tableName}: ${errMessage}`,
      );

      // Inclure les candidats de la résolution précédente pour suggestions
      const fallbackCandidates = resolved.candidates.length > 0
        ? resolved.candidates
        : await this.searchAllCandidates(tableName, searchTerm, additionalFilters);

      this.logger.log(
        `🔍 Retour de ${fallbackCandidates.length} suggestions pour "${searchTerm}" dans ${tableName} ` +
        `(après échec de création)`,
      );

      return {
        resolved: {
          found: false,
          best: null,
          score: 0,
          matchedOn: '',
          candidates: fallbackCandidates,
          ambiguous: false,
        },
        created: false,
        message: `Impossible de créer "${searchTerm}" dans ${tableName}. ${cleanMessage}` +
          (fallbackCandidates.length > 0
            ? ` Voici les suggestions disponibles (${fallbackCandidates.length} résultat(s)).`
            : ` Aucune correspondance trouvée. Veuillez fournir plus de détails.`),
      };
    }
  }

  /**
   * Recherche tous les candidats pour un terme sans seuil de score minimum.
   * Utilisé pour fournir des suggestions quand une entité de référence n'est pas trouvée.
   *
   * Stratégie améliorée :
   *  1. Si un resolver spécialisé existe (employee, customer), l'utiliser en priorité
   *     car il sait faire les jointures (ex: employee → user.first_name)
   *  2. Sinon → résolution générique via TypeORM metadata
   */
  private async searchAllCandidates(
    tableName: string,
    searchTerm: string,
    additionalFilters?: Record<string, any>,
  ): Promise<ResolveMatch<any>[]> {
    // ── 1. Resolver spécialisé (joins, relations) ──
    const specializedResolver = this.projectConfig?.specializedResolvers?.find(
      r => r.tables.includes(tableName),
    );
    if (specializedResolver) {
      try {
        this.logger.debug(`🔍 searchAllCandidates via resolver spécialisé pour "${tableName}"`);
        const result = await specializedResolver.resolve(searchTerm, {
          mode: ResolveMode.BEST_EFFORT,
          minScore: 0,
          ambiguityGap: 0,
        });
        if (result.candidates && result.candidates.length > 0) {
          this.logger.log(
            `🔍 ${result.candidates.length} candidats trouvés via resolver spécialisé "${tableName}"`,
          );
          return result.candidates;
        }
      } catch (err) {
        this.logger.warn(`⚠️ Resolver spécialisé échoué pour "${tableName}": fallback générique`);
      }
    }

    // ── 2. Résolution générique ──
    const entityMeta = this.dataSource.entityMetadatas.find(m => m.tableName === tableName);
    if (!entityMeta) return [];

    const repo = this.dataSource.getRepository(entityMeta.target);
    const searchFields = this.getSearchableFields(entityMeta);
    const ni = normalize(searchTerm);
    const tokens = ni.split(' ').filter(t => t.length > 0);
    const extra = additionalFilters ?? {};

    // Chercher avec le premier token uniquement (recherche large)
    const conditions = searchFields.map(field =>
      ({ [field]: ILike(`%${tokens[0] ?? searchTerm}%`), ...extra } as any),
    );

    let rows: any[] = [];
    try {
      rows = await repo.find({ where: conditions, take: 10 });
    } catch { /* ignore */ }

    return rows
      .map(entity => {
        let bestScore = 0;
        let bestField = '';
        for (const field of searchFields) {
          const s = similarityScore(searchTerm, String(entity[field] ?? ''));
          if (s > bestScore) { bestScore = s; bestField = `${field}: ${String(entity[field] ?? '').slice(0, 40)}`; }
        }
        return { entity, score: bestScore, matchedOn: bestField };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Crée une entité à partir d'un texte de recherche.
   *
   * Analyse intelligente du texte pour déterminer les champs :
   *   - "Jean Dupont" → first_name="Jean", last_name="Dupont"
   *   - "SARL Dupont et Fils" → company_name="SARL Dupont et Fils"
   *   - "jean.dupont@email.com" → email="jean.dupont@email.com"
   *
   * Utilise les métadonnées TypeORM + @BusinessColumn pour ne remplir
   * que les champs pertinents et laisser les defaults/auto-générés tranquilles.
   */
  async createEntityFromText(
    tableName: string,
    text: string,
    userId: string,
    contextFields?: Record<string, any>,
  ): Promise<any> {
    const entityMeta = this.dataSource.entityMetadatas.find(
      m => m.tableName === tableName,
    );
    if (!entityMeta) {
      throw new Error(`Table "${tableName}" inconnue dans TypeORM`);
    }

    const repo = this.dataSource.getRepository(entityMeta.target);
    const fields = this.inferFieldsFromText(entityMeta, text);

    // Fusionner avec les champs contextuels (fournis par le handler appelant)
    if (contextFields) {
      Object.assign(fields, contextFields);
    }

    // Ajouter created_by
    fields.created_by = userId;

    this.logger.debug(`📝 Création de ${tableName} avec les champs: ${JSON.stringify(fields)}`);

    // Créer et sauvegarder
    const record = repo.create(fields);
    const saved = await repo.save(record);
    return saved;
  }

  /**
   * Infère les champs d'une entité à partir d'un texte brut.
   *
   * Stratégie :
   *   1. Cherche les champs "name", "first_name", "last_name", "company_name"
   *      dans les métadonnées TypeORM
   *   2. Si aucun champ standard trouvé, regarde les relations ManyToOne/OneToOne
   *      (ex: employee.user contient first_name/last_name)
   *   3. Tente de splitter le texte en prénom + nom (si 2 tokens)
   *   4. Détecte les emails, numéros, etc.
   *   5. Dernier recours : utilise le premier champ varchar trouvé
   */
  private inferFieldsFromText(
    entityMeta: import('typeorm').EntityMetadata,
    text: string,
  ): Record<string, any> {
    const fields: Record<string, any> = {};
    const columns = entityMeta.columns;
    const columnNames = columns.map(c => c.databaseName);
    const columnSet = new Set(columnNames);
    const normalized = normalize(text);
    const tokens = normalized.split(' ').filter(t => t.length > 0);

    // Détection du type de contenu
    const hasAtSymbol = text.includes('@');
    const hasMultipleTokens = tokens.length >= 2;

    // --- Regarder dans les relations si la table n'a pas first_name/last_name ---
    // Ex: employee n'a pas first_name directement (c'est dans user)
    // On va chercher à travers les relations pour trouver des champs textuels
    const hasDirectNameCol = columnSet.has('first_name') || columnSet.has('last_name') || columnSet.has('name');
    
    // --- Gestion des différents cas ---

    // Cas 1: C'est un email
    if (hasAtSymbol && columnSet.has('email')) {
      fields.email = text.trim();
      const emailParts = text.split('@')[0].split('.');
      if (emailParts.length >= 2) {
        if (columnSet.has('first_name')) fields.first_name = this.capitalize(emailParts[0]);
        if (columnSet.has('last_name')) fields.last_name = this.capitalize(emailParts.slice(1).join(' '));
      }
      return fields;
    }

    // Cas 2: C'est un nom d'entreprise ou une personne avec prénom + nom
    const hasNameCol = columnSet.has('first_name') || columnSet.has('last_name');
    const hasCompanyCol = columnSet.has('company_name');

    if (hasNameCol && hasMultipleTokens && tokens.length <= 3) {
      // Probablement une personne: "Jean Dupont", "Dupont Jean", "Jean Marc Dupont"
      const originalTokens = text.trim().split(/\s+/).filter(t => t.length > 0);

      if (originalTokens.length === 2) {
        // "Prénom Nom" ou "Nom Prénom"
        if (columnSet.has('first_name')) fields.first_name = this.capitalize(originalTokens[0]);
        if (columnSet.has('last_name')) fields.last_name = this.capitalize(originalTokens[1]);
      } else if (originalTokens.length >= 3) {
        // "Prénom Nom" avec prénom composé: "Jean Marc Dupont"
        if (columnSet.has('first_name')) fields.first_name = this.capitalize(originalTokens.slice(0, -1).join(' '));
        if (columnSet.has('last_name')) fields.last_name = this.capitalize(originalTokens[originalTokens.length - 1]);
      }
    } else if (hasCompanyCol && tokens.length >= 2) {
      // Texte long → probablement une entreprise
      fields.company_name = text.trim();
    } else if (hasNameCol && tokens.length === 1) {
      // Un seul token → on le met dans last_name si disponible
      if (columnSet.has('last_name')) fields.last_name = this.capitalize(text.trim());
    }

    // 🔥 CORRECTION : Si aucun champ n'a été trouvé MAIS que la table existe
    // (ex: employee sans first_name/last_name car c'est dans une relation),
    // on utilise le premier champ varchar disponible
    if (Object.keys(fields).length === 0) {
      // Essayer les colonnes de type texte standard
      if (columnSet.has('name')) fields.name = text.trim();
      else if (columnSet.has('label')) fields.label = text.trim();
      else if (columnSet.has('title')) fields.title = text.trim();
      else if (columnSet.has('full_name')) fields.full_name = text.trim();
      else if (columnSet.has('code')) fields.code = text.trim();
      else if (columnSet.has('last_name')) fields.last_name = this.capitalize(text.trim());
      else if (columnSet.has('first_name')) fields.first_name = this.capitalize(text.trim());
      else {
        // Dernier recours : prendre le premier champ varchar non-système
        for (const col of columns) {
          const dbName = col.databaseName;
          const colType = String(col.type).toLowerCase();
          const isText = ['varchar', 'text', 'char'].includes(colType);
          const isSystem = ['id', 'created_at', 'updated_at', 'deleted_at', 'password', 'token', 'secret'].includes(dbName);
          if (isText && !isSystem && !col.isPrimary) {
            fields[col.propertyName] = text.trim();
            this.logger.debug(`📝 Fallback: champ "${col.propertyName}" ← "${text}"`);
            break;
          }
        }
      }
    }

    // Si toujours aucun champ, on lève une erreur claire
    if (Object.keys(fields).length === 0) {
      throw new Error(
        `Impossible de déterminer les champs à créer pour "${entityMeta.tableName}". ` +
        `Aucune colonne textuelle (name, label, title, etc.) trouvée. ` +
        `Veuillez fournir des informations plus précises.`
      );
    }

    return fields;
  }

  /**
   * Met la première lettre en majuscule, le reste en minuscule
   */
  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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

  // ─── EXACT MATCH ─────────────────────────────────────────────────────────

  /**
   * Tente une correspondance exacte (terme de recherche = valeur du champ) sur chaque
   * champ searchable, dans l'ordre.
   *
   * Indispensable pour les codes structurés : numéros de dossier (DOS-XXXX-XXXX-XXXX),
   * références (REF-XXX), codes juridiction, etc. Sans cela, le fuzzy matching tokenise
   * les tirets et ne peut pas retrouver la correspondance exacte.
   *
   * Retourne la première entité trouvée, ou null si aucune.
   */
  private async tryExactMatch(
    repo: import('typeorm').Repository<any>,
    searchFields: string[],
    searchTerm: string,
    additionalFilters?: Record<string, any>,
  ): Promise<any | null> {
    const term = searchTerm.trim();
    if (!term) return null;
    const extra = additionalFilters ?? {};
    for (const field of searchFields) {
      try {
        const found = await repo.findOne({ where: { [field]: term, ...extra } });
        if (found) return found;
      } catch { /* colonne incompatible (type), on ignore */ }
    }
    return null;
  }

  // ─── BUILDER DE RÉSULTAT ──────────────────────────────────────────────────

  private buildResult<T>(
    scored: ResolveMatch<T>[],
    input: string,
    entityLabel: string,
    config?: ResolveConfig,
  ): ResolveResult<T> {
    if (scored.length === 0) {
      this.logger.warn(`❌ Aucun ${entityLabel} trouvé pour "${input}"`);
      return { found: false, best: null, score: 0, matchedOn: '', candidates: [], ambiguous: false };
    }

    const best = scored[0];
    const second = scored[1];

    // Appliquer la config : mode BEST_EFFORT → prendre le meilleur même si ambigu
    // Par défaut : STRICT (sûr) - l'utilisateur/LLM peut passer BEST_EFFORT
    const mode = config?.mode || ResolveMode.STRICT;
    const minScore = config?.minScore ?? this.MIN_SCORE;
    const ambiguityGap = config?.ambiguityGap ?? this.AMBIGUITY_GAP;

    // En BEST_EFFORT, l'ambiguïté est ignorée : on prend toujours le meilleur
    // On réduit aussi le minScore pour être plus tolérant
    const effectiveMinScore = mode === ResolveMode.BEST_EFFORT ? Math.max(minScore, 20) : minScore;
    const effectiveGap = mode === ResolveMode.BEST_EFFORT ? 0 : ambiguityGap;

    // Filtrer les candidats en dessous du score minimum
    const valid = scored.filter(m => m.score >= effectiveMinScore);
    if (valid.length === 0) {
      // ⚠️ Aucun match concluant → retourner le top 10 comme suggestions
      // pour que l'appelant puisse laisser l'utilisateur choisir
      const suggestions = scored.slice(0, 10);
      this.logger.warn(
        `❌ Aucun ${entityLabel} valide pour "${input}" (score min: ${effectiveMinScore}). ` +
        `Retour de ${suggestions.length} suggestions (top score: ${suggestions[0]?.score ?? 0}).`,
      );
      return { found: false, best: null, score: 0, matchedOn: '', candidates: suggestions, ambiguous: false };
    }

    const bestValid = valid[0];
    const secondValid = valid[1];
    const ambiguous = !!secondValid && (bestValid.score - secondValid.score) < effectiveGap && bestValid.score < 90;

    if (mode === ResolveMode.BEST_EFFORT) {
      // 🎯 BEST_EFFORT : on prend le meilleur score, ambigu ou pas
      this.logger.log(
        `🎯 ${entityLabel} résolu (BEST_EFFORT): "${input}" → ` +
        `"${bestValid.matchedOn}" (score: ${bestValid.score})` +
        (secondValid ? `, 2ème: "${secondValid.matchedOn}" (${secondValid.score})` : ''),
      );
      return {
        found: true,
        best: bestValid.entity,
        score: bestValid.score,
        matchedOn: bestValid.matchedOn,
        candidates: valid,
        ambiguous: false, // On force ambiguous=false pour ne pas bloquer
      };
    }

    // STRICT (comportement actuel)
    if (ambiguous) {
      this.logger.warn(
        `⚠️ Ambiguïté détectée pour "${input}": ` +
        valid.slice(0, 3).map(s => `${s.matchedOn}(${s.score})`).join(', '),
      );
    } else {
      this.logger.log(
        `✅ ${entityLabel} résolu: "${input}" → score ${bestValid.score} via "${bestValid.matchedOn}"`,
      );
    }

    return {
      found: true,
      best: bestValid.entity,
      score: bestValid.score,
      matchedOn: bestValid.matchedOn,
      candidates: valid,
      ambiguous,
    };
  }
}
