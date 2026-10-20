// src/core/ai-database/write/entity-resolver.service.ts
import { DataSource, ILike, Repository } from 'typeorm';
import {
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';

import {
  BUSINESS_METADATA_KEY,
  BusinessColumnMetadata,
} from '../../decorators/business-metadata.decorator';
import { AiDatabasePermissionService } from '../ai-database-permission.service';
import { fillRequiredGeneratedColumns } from './base-write-handler';
import { AI_DATABASE_PROJECT_CONFIG } from '../ai-database.tokens';
import { AiDatabaseProjectConfig } from '../interfaces/ai-database-project-config.interface';
import { getCurrentTenantId, hasActiveTenant } from '../../tenant/tenant.context';
import {
  DeterministicPick,
  MATCH_TIER_LABELS,
  MATCH_TIER_RANK,
  pickDeterministic,
  searchWords,
} from './exact-match';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolveMatch<T> {
  entity: T;
  score: number; // 0–100
  matchedOn: string; // ex: "prénom+nom", "email", "entreprise"
}

export interface ResolveResult<T> {
  found: boolean;
  best: T | null;
  score: number;
  matchedOn: string;
  candidates: ResolveMatch<T>[]; // candidats, les plus sûrs d'abord
  ambiguous: boolean; // true si plusieurs enregistrements correspondent au même niveau
}

/**
 * Ancien mode de résolution, conservé pour les plans déjà enregistrés.
 * Sans effet : la résolution est déterministe (exact-match.ts) et ne
 * choisit jamais « au plus probable ».
 */
export enum ResolveMode {
  STRICT = 'strict',
  BEST_EFFORT = 'best_effort',
}

/** Ancienne configuration de résolution (sans effet, voir ResolveMode). */
export interface ResolveConfig {
  mode?: ResolveMode;
  minScore?: number;
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

// ─── Correspondance déterministe ─────────────────────────────────────────────

/** Normalisation des termes pour les recherches LIKE (sans accents ni ponctuation). */
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // supprime les accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Champs qui servent à reconnaître un enregistrement (nom, numéro, code…).
 * Les textes libres (description, notes…) n'en font pas partie : un nom cité
 * dans la description d'un dossier ne désigne pas ce dossier.
 */
const NON_IDENTIFYING = /description|comment|note|observation|content|contenu|body|message|summary|resume/i;

/** Référentiels (types, statuts, villes…) : une abréviation unique suffit (« PART » → « PARTICULIER »). */
const REFERENCE_TABLE =
  /(^type_|_types?$|^types?_|status|statut|categor|^location_|_cit(y|ies)$|countr|jurisdiction|branch|agenc|famil|nature|level|niveau|priorit)/i;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EntityResolverService {
  private readonly logger = new Logger(EntityResolverService.name);

  /** Lignes lues pour reconnaître un texte (mot le plus distinctif). */
  private readonly CANDIDATE_LIMIT = 200;

  /** Suggestions proposées quand rien ne correspond exactement. */
  private readonly SUGGESTION_LIMIT = 10;

  /**
   * Cache des champs "searchable" par table.
   * Déterminés automatiquement depuis les BusinessColumn + heuristiques.
   */
  private searchableFieldsCache = new Map<string, string[]>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly aiPermissionService: AiDatabasePermissionService,
    @Optional()
    @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
  ) {}

  // ─── RÉSOLUTION GÉNÉRIQUE PAR NOM DE TABLE ─────────────────────────────────

  /**
   * Point d'entrée principal pour BaseWriteHandler et le système générique.
   * Résout N'IMPORTE QUELLE entité à partir de son nom de table et d'un texte
   * (nom, numéro, code, e-mail…), SANS score de similarité :
   *
   *  1. resolver spécialisé (client, collaborateur) s'il existe ;
   *  2. égalité exacte en base sur un champ identifiant ;
   *  3. sinon règles déterministes (voir exact-match.ts) : tous les mots du
   *     texte présents (ou abréviation pour un référentiel). Un seul
   *     enregistrement → retenu ; plusieurs → l'utilisateur choisit ;
   *     aucun → les enregistrements proches sont seulement proposés.
   *
   * `config` est conservé pour compatibilité : il n'autorise plus aucun choix
   * « au plus probable ».
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
      (r) => r.tables.includes(tableName),
    );
    if (specializedResolver) {
      return specializedResolver.resolve(searchTerm, config);
    }

    // ── 2. Résolution générique ──
    const lookup = this.lookupFor(tableName);
    if (!lookup) return { ...EMPTY_RESULT, candidates: [] };
    const { meta, repo, fields } = lookup;

    // ── Égalité exacte en base (codes structurés : DOS-2026-0001, e-mails…) ──
    const exactRows = await this.tryExactMatch(repo, fields, searchTerm, additionalFilters);
    if (exactRows.length) {
      const own = this.preferOwnTenant(exactRows);
      const matches = own.map((entity) => ({ entity, tier: 'exact' as const }));
      const pick: DeterministicPick<any> =
        own.length === 1
          ? { best: own[0], bestTier: 'exact', ambiguous: false, matches }
          : { best: null, bestTier: null, ambiguous: true, matches };
      return this.toResult(pick, fields, tableName, searchTerm);
    }

    // ── Mots du texte : lignes contenant le mot le plus distinctif ──
    const rows = await this.findRowsContaining(
      repo,
      fields,
      searchWords(searchTerm).slice(0, 1),
      additionalFilters,
      this.CANDIDATE_LIMIT,
    );
    let pick = this.pick(tableName, meta, searchTerm, rows, fields);
    if (!pick.best && !pick.ambiguous) {
      // Rien de sûr : élargir aux autres mots, seulement pour proposer.
      const more = await this.findRowsContaining(
        repo,
        fields,
        searchWords(searchTerm),
        additionalFilters,
        this.SUGGESTION_LIMIT * 3,
      );
      pick = this.pick(tableName, meta, searchTerm, uniqueById([...rows, ...more]), fields);
    }
    return this.toResult(pick, fields, tableName, searchTerm);
  }

  /**
   * Recherche pour une liste déroulante (carte de confirmation) : lignes qui
   * contiennent le texte, les correspondances sûres d'abord. Ne choisit rien.
   */
  async searchCandidates(
    tableName: string,
    query: string,
    additionalFilters?: Record<string, any>,
    limit = 20,
  ): Promise<any[]> {
    const lookup = this.lookupFor(tableName);
    if (!lookup) return [];
    const { meta, repo, fields } = lookup;
    const rows = await this.findRowsContaining(repo, fields, searchWords(query), additionalFilters, limit * 3);
    const pick = this.pick(tableName, meta, query, rows, fields);
    return uniqueById([...pick.matches.map((m) => m.entity), ...rows]).slice(0, limit);
  }

  /** Table, dépôt et champs identifiants d'une table connue de TypeORM. */
  private lookupFor(tableName: string) {
    const meta = this.dataSource.entityMetadatas.find((m) => m.tableName === tableName);
    if (!meta) {
      this.logger.warn(`❌ Table inconnue: ${tableName}`);
      return null;
    }
    const fields = this.getIdentifyingFields(meta);
    if (!fields.length) {
      this.logger.warn(`⚠️ Aucun champ identifiant trouvé pour "${tableName}"`);
      return null;
    }
    return { meta, repo: this.dataSource.getRepository(meta.target), fields };
  }

  /** Champs identifiants : les champs « searchable » hors textes libres. */
  private getIdentifyingFields(meta: import('typeorm').EntityMetadata): string[] {
    const searchable = this.getSearchableFields(meta);
    const identifying = searchable.filter((field) => {
      if (NON_IDENTIFYING.test(field)) return false;
      const type = String(meta.columns.find((c) => c.propertyName === field)?.type ?? '').toLowerCase();
      return !['text', 'mediumtext', 'longtext'].includes(type);
    });
    return identifying.length ? identifying : searchable;
  }

  /** Lignes dont un champ identifiant contient l'un des mots (LIKE ; cabinet courant via le patch tenant). */
  private async findRowsContaining(
    repo: Repository<any>,
    fields: string[],
    words: string[],
    additionalFilters: Record<string, any> | undefined,
    take: number,
  ): Promise<any[]> {
    const usable = words.filter((w) => w.length >= 2);
    if (!usable.length) return [];
    const extra = additionalFilters ?? {};
    const where = fields.flatMap((field) =>
      usable.map((word) => ({ [field]: ILike(`%${word}%`), ...extra }) as any),
    );
    try {
      return await repo.find({ where, take });
    } catch (err) {
      this.logger.warn(
        `⚠️ Recherche sur "${repo.metadata.tableName}" impossible : ${(err as Error).message}`,
      );
      return [];
    }
  }

  private pick(
    tableName: string,
    meta: import('typeorm').EntityMetadata,
    term: string,
    rows: any[],
    fields: string[],
  ): DeterministicPick<any> {
    const allowPrefix = REFERENCE_TABLE.test(tableName) || REFERENCE_TABLE.test(meta.name);
    const pick = pickDeterministic(term, rows, (row) => this.identityTexts(row, fields), {
      allowPrefix,
    });
    if (!pick.ambiguous) return pick;
    // Référentiel partagé : la copie du cabinet l'emporte sur la ligne plateforme de même valeur.
    const own = this.preferOwnTenant(pick.matches.map((m) => m.entity));
    if (own.length === 1) {
      return { best: own[0], bestTier: pick.matches[0].tier, ambiguous: false, matches: pick.matches };
    }
    return pick;
  }

  /** Valeurs qui identifient une ligne, plus « prénom nom » dans les deux sens. */
  private identityTexts(row: any, fields: string[]): unknown[] {
    const texts: unknown[] = fields.map((field) => row?.[field]);
    const first = row?.first_name ?? row?.firstName;
    const last = row?.last_name ?? row?.lastName;
    if (first && last) texts.push(`${first} ${last}`, `${last} ${first}`);
    return texts;
  }

  /** Libellé lisible d'une ligne (« Jean Dupont · CLI-0004 »). */
  private recordLabel(row: any, fields: string[]): string {
    const parts = fields
      .map((field) => row?.[field])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => String(v).trim());
    const unique = parts.filter(
      (v, i) => parts.findIndex((o) => o.toLowerCase() === v.toLowerCase()) === i,
    );
    return unique.slice(0, 3).join(' · ').slice(0, 80) || `#${row?.id}`;
  }

  /**
   * Plusieurs lignes égales : garder celles du cabinet courant quand des lignes
   * plateforme (tenant 1) ont la même valeur. Sinon les lignes telles quelles.
   */
  private preferOwnTenant(rows: any[]): any[] {
    if (rows.length < 2 || !hasActiveTenant()) return rows;
    const tenant = Number(getCurrentTenantId());
    const own = rows.filter((row) => row?.tenant_id !== undefined && Number(row.tenant_id) === tenant);
    return own.length ? own : rows;
  }

  private toResult(
    pick: DeterministicPick<any>,
    fields: string[],
    tableName: string,
    term: string,
  ): ResolveResult<any> {
    const candidates: ResolveMatch<any>[] = pick.matches
      .slice(0, this.SUGGESTION_LIMIT)
      .map((m) => ({
        entity: m.entity,
        score: MATCH_TIER_RANK[m.tier],
        matchedOn: this.recordLabel(m.entity, fields),
      }));
    if (pick.best) {
      const tier = pick.bestTier ?? 'exact';
      this.logger.log(`✅ ${tableName} : « ${term} » → #${pick.best.id} (${MATCH_TIER_LABELS[tier]})`);
      return {
        found: true,
        best: pick.best,
        score: MATCH_TIER_RANK[tier],
        matchedOn: this.recordLabel(pick.best, fields),
        candidates,
        ambiguous: false,
      };
    }
    this.logger.log(
      pick.ambiguous
        ? `⚠️ ${tableName} : « ${term} » désigne ${pick.matches.length} enregistrements — choix demandé`
        : `❌ ${tableName} : rien ne correspond exactement à « ${term} » (${candidates.length} proposition(s))`,
    );
    return { found: false, best: null, score: 0, matchedOn: '', candidates, ambiguous: pick.ambiguous };
  }

  /**
   * Détermine les champs "searchable" d'une entité automatiquement.
   * Résultat mis en cache pour performance.
   */
  private getSearchableFields(
    entityMeta: import('typeorm').EntityMetadata,
  ): string[] {
    const tableName = entityMeta.tableName;

    if (this.searchableFieldsCache.has(tableName)) {
      return this.searchableFieldsCache.get(tableName)!;
    }

    const fields: string[] = [];
    const prototype = (entityMeta.target as Function).prototype;

    // Patterns de noms de colonnes "naturellement searchable"
    const SEARCHABLE_PATTERNS = [
      /name/i,
      /nom/i,
      /prenom/i,
      /first.?name/i,
      /last.?name/i,
      /code/i,
      /email/i,
      /label/i,
      /title/i,
      /titre/i,
      /libelle/i,
      /numero/i,
      /number/i,
      /reference/i,
      /ref/i,
      /sigle/i,
      /abbreviation/i,
      /designation/i,
      /intitule/i,
      /company/i,
      /entreprise/i,
      /raison.?sociale/i,
      /description/i,
      /phone/i,
      /telephone/i,
    ];

    // Types de colonnes textuelles
    const TEXT_TYPES = new Set([
      'varchar',
      'text',
      'char',
      'tinytext',
      'mediumtext',
      'longtext',
      'character varying',
      'nvarchar',
      'nchar',
      String,
    ]);

    for (const column of entityMeta.columns) {
      const dbName = column.databaseName;
      const propName = column.propertyName;

      // Ignorer les colonnes système
      if (
        [
          'id',
          'created_at',
          'updated_at',
          'deleted_at',
          'created_by',
          'updated_by',
          'deleted_by',
          'password',
          'token',
          'secret',
        ].includes(dbName)
      ) {
        continue;
      }

      // Vérifier que c'est un type texte
      const colType = String(column.type).toLowerCase();
      const isText =
        TEXT_TYPES.has(colType) ||
        colType === 'string' ||
        column.type === String;
      if (!isText) continue;

      // Vérifier via @BusinessColumn
      let bCol: BusinessColumnMetadata | undefined;
      try {
        bCol = Reflect.getMetadata(
          BUSINESS_METADATA_KEY,
          prototype,
          propName,
        ) as BusinessColumnMetadata;
      } catch {
        /* ignore */
      }

      if (bCol?.ignored || bCol?.sensitive) continue;

      // Priorité 1 : importance "critical" ou "high" → toujours searchable
      if (bCol?.importance === 'critical' || bCol?.importance === 'high') {
        fields.push(propName);
        continue;
      }

      // Priorité 2 : nom de colonne match un pattern searchable
      if (SEARCHABLE_PATTERNS.some((p) => p.test(dbName) || p.test(propName))) {
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
        const isText =
          TEXT_TYPES.has(colType) ||
          colType === 'string' ||
          column.type === String;
        const isSystem = [
          'id',
          'created_at',
          'updated_at',
          'deleted_at',
          'password',
          'token',
        ].includes(column.databaseName);
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
    this.logger.log(
      `🔄 resolveOrCreateEntity("${tableName}", "${searchTerm}")`,
    );

    // 1. D'abord, tenter une résolution normale (avec la config passée)
    const resolved = await this.resolveAnyEntity(
      tableName,
      searchTerm,
      config,
      additionalFilters,
    );

    if (resolved.found && !resolved.ambiguous) {
      // ✅ Trouvé et non ambigu → retourner le résultat
      return {
        resolved,
        created: false,
        message: `« ${searchTerm} » a été trouvé(e)`,
      };
    }

    if (resolved.ambiguous) {
      // ⚠️ Ambiguïté → on ne crée pas, on laisse l'utilisateur décider
      const suggestions = resolved.candidates
        .slice(0, 3)
        .map((c) => `"${c.matchedOn}"`)
        .join(', ');
      this.logger.warn(
        `⚠️ Ambiguïté pour "${searchTerm}" dans ${tableName}: ${suggestions}`,
      );
      return {
        resolved,
        created: false,
        message: `Plusieurs correspondances trouvées pour "${searchTerm}" dans ${tableName}. Veuillez préciser : ${suggestions}`,
      };
    }

    // 🚫 Liste des entités qu'on ne crée JAMAIS automatiquement
    // La liste de base (core générique) + additions du projet via projectConfig
    const NEVER_AUTO_CREATE = new Set<string>([
      'user',
      'users', // toujours protégés dans le core
      ...(this.projectConfig?.neverAutoCreate ?? []),
    ]);

    if (NEVER_AUTO_CREATE.has(tableName)) {
      this.logger.warn(
        `⛔ Création automatique refusée pour "${tableName}" (donnée de référence)`,
      );

      // Suggestions : candidats de la résolution, sinon recherche large.
      const allCandidates =
        resolved.candidates.length > 0
          ? resolved.candidates
          : await this.searchAllCandidates(
              tableName,
              searchTerm,
              additionalFilters,
            );

      const suggestions = allCandidates
        .slice(0, 3)
        .map((c) => `"${c.matchedOn}"`);

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

    // Des enregistrements proches existent (mot en commun, abréviation) :
    // créer en silence ferait un doublon en cas de faute de frappe. On
    // propose de choisir ; « Autre » crée la valeur saisie.
    if (resolved.candidates.length > 0) {
      return {
        resolved,
        created: false,
        message: `Aucun(e) ${tableName} ne correspond exactement à « ${searchTerm} » : choisissez parmi les propositions ou créez-le.`,
      };
    }

    // 2. ❌ Rien d'approchant → créer l'entité automatiquement
    this.logger.log(
      `➕ Création automatique de "${searchTerm}" dans ${tableName}`,
    );
    try {
      await this.aiPermissionService.assertCanWritePlan(userId, {
        transaction: false,
        operations: [
          {
            operation: 'INSERT',
            entity: tableName,
            fields: {},
            humanReadable: `Creation automatique de ${tableName}`,
          },
        ],
        humanReadable: `Creation automatique de ${tableName}`,
        confidence: 1,
      });
      const newEntity = await this.createEntityFromText(
        tableName,
        searchTerm,
        userId,
        contextFields,
      );
      const entityId = newEntity.id;

      this.logger.log(
        `✅ Création automatique réussie: ${tableName} "${searchTerm}" → ID ${entityId}`,
      );

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
        message: `« ${searchTerm} » a été créé(e) automatiquement`,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
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
      const fallbackCandidates =
        resolved.candidates.length > 0
          ? resolved.candidates
          : await this.searchAllCandidates(
              tableName,
              searchTerm,
              additionalFilters,
            );

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
        message:
          `Impossible de créer "${searchTerm}" dans ${tableName}. ${cleanMessage}` +
          (fallbackCandidates.length > 0
            ? ` Voici les suggestions disponibles (${fallbackCandidates.length} résultat(s)).`
            : ` Aucune correspondance trouvée. Veuillez fournir plus de détails.`),
      };
    }
  }

  /**
   * Suggestions pour un texte introuvable (enregistrements qui en partagent un
   * mot), les plus proches d'abord. Le resolver spécialisé passe en premier
   * (il sait faire les jointures, ex: employee → user.first_name).
   */
  private async searchAllCandidates(
    tableName: string,
    searchTerm: string,
    additionalFilters?: Record<string, any>,
  ): Promise<ResolveMatch<any>[]> {
    const specializedResolver = this.projectConfig?.specializedResolvers?.find(
      (r) => r.tables.includes(tableName),
    );
    if (specializedResolver) {
      try {
        const result = await specializedResolver.resolve(searchTerm);
        if (result.candidates?.length) return result.candidates;
      } catch {
        this.logger.warn(`⚠️ Resolver spécialisé échoué pour "${tableName}": recherche générique`);
      }
    }

    const lookup = this.lookupFor(tableName);
    if (!lookup) return [];
    const rows = await this.searchCandidates(tableName, searchTerm, additionalFilters, this.SUGGESTION_LIMIT);
    return rows.map((entity) => ({
      entity,
      score: MATCH_TIER_RANK.partial,
      matchedOn: this.recordLabel(entity, lookup.fields),
    }));
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
      (m) => m.tableName === tableName,
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

    this.logger.debug(
      `📝 Création de ${tableName} avec les champs: ${JSON.stringify(fields)}`,
    );

    // Créer et sauvegarder (code obligatoire généré comme à la création manuelle)
    const record = repo.create(await fillRequiredGeneratedColumns(repo, fields));
    const saved = await repo.save(record);
    return saved;
  }

  /**
   * Champs d'une nouvelle ligne de `tableName` nommée `text` (nom, prénom +
   * nom, raison sociale…), pour une création demandée explicitement.
   */
  creationFieldsFromText(tableName: string, text: string): Record<string, any> {
    const entityMeta = this.dataSource.entityMetadatas.find(
      (m) => m.tableName === tableName,
    );
    if (!entityMeta) throw new Error(`Table "${tableName}" inconnue dans TypeORM`);
    return this.inferFieldsFromText(entityMeta, text);
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
    const columnNames = columns.map((c) => c.databaseName);
    const columnSet = new Set(columnNames);
    const normalized = normalize(text);
    const tokens = normalized.split(' ').filter((t) => t.length > 0);

    // Détection du type de contenu
    const hasAtSymbol = text.includes('@');
    const hasMultipleTokens = tokens.length >= 2;

    // --- Regarder dans les relations si la table n'a pas first_name/last_name ---
    // Ex: employee n'a pas first_name directement (c'est dans user)
    // On va chercher à travers les relations pour trouver des champs textuels
    const hasDirectNameCol =
      columnSet.has('first_name') ||
      columnSet.has('last_name') ||
      columnSet.has('name');

    // --- Gestion des différents cas ---

    // Cas 1: C'est un email
    if (hasAtSymbol && columnSet.has('email')) {
      fields.email = text.trim();
      const emailParts = text.split('@')[0].split('.');
      if (emailParts.length >= 2) {
        if (columnSet.has('first_name'))
          fields.first_name = this.capitalize(emailParts[0]);
        if (columnSet.has('last_name'))
          fields.last_name = this.capitalize(emailParts.slice(1).join(' '));
      }
      return fields;
    }

    // Cas 2: C'est un nom d'entreprise ou une personne avec prénom + nom
    const hasNameCol =
      columnSet.has('first_name') || columnSet.has('last_name');
    const hasCompanyCol = columnSet.has('company_name');

    if (hasNameCol && hasMultipleTokens && tokens.length <= 3) {
      // Probablement une personne: "Jean Dupont", "Dupont Jean", "Jean Marc Dupont"
      const originalTokens = text
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);

      if (originalTokens.length === 2) {
        // "Prénom Nom" ou "Nom Prénom"
        if (columnSet.has('first_name'))
          fields.first_name = this.capitalize(originalTokens[0]);
        if (columnSet.has('last_name'))
          fields.last_name = this.capitalize(originalTokens[1]);
      } else if (originalTokens.length >= 3) {
        // "Prénom Nom" avec prénom composé: "Jean Marc Dupont"
        if (columnSet.has('first_name'))
          fields.first_name = this.capitalize(
            originalTokens.slice(0, -1).join(' '),
          );
        if (columnSet.has('last_name'))
          fields.last_name = this.capitalize(
            originalTokens[originalTokens.length - 1],
          );
      }
    } else if (hasCompanyCol && tokens.length >= 2) {
      // Texte long → probablement une entreprise
      fields.company_name = text.trim();
    } else if (hasNameCol && tokens.length === 1) {
      // Un seul token → on le met dans last_name si disponible
      if (columnSet.has('last_name'))
        fields.last_name = this.capitalize(text.trim());
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
      else if (columnSet.has('last_name'))
        fields.last_name = this.capitalize(text.trim());
      else if (columnSet.has('first_name'))
        fields.first_name = this.capitalize(text.trim());
      else {
        // Dernier recours : prendre le premier champ varchar non-système
        for (const col of columns) {
          const dbName = col.databaseName;
          const colType = String(col.type).toLowerCase();
          const isText = ['varchar', 'text', 'char'].includes(colType);
          const isSystem = [
            'id',
            'created_at',
            'updated_at',
            'deleted_at',
            'password',
            'token',
            'secret',
          ].includes(dbName);
          if (isText && !isSystem && !col.isPrimary) {
            fields[col.propertyName] = text.trim();
            this.logger.debug(
              `📝 Fallback: champ "${col.propertyName}" ← "${text}"`,
            );
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
          `Veuillez fournir des informations plus précises.`,
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
   * Résoudre une entité par des champs texte arbitraires (mêmes règles
   * déterministes que resolveAnyEntity). API pour les handlers custom.
   */
  async resolveByFields<T extends object>(
    repo: Repository<T>,
    input: string,
    searchFields: (keyof T)[],
    labelFields: (keyof T)[],
  ): Promise<ResolveResult<T>> {
    const fields = searchFields.map(String);
    const rows = (await this.findRowsContaining(repo, fields, searchWords(input), undefined, 50)) as T[];
    const pick = pickDeterministic(input, rows, (row) =>
      labelFields.map((f) => (row as any)[f]),
    );
    return this.toResult(pick, labelFields.map(String), repo.metadata.tableName, input);
  }

  // ─── EXACT MATCH ─────────────────────────────────────────────────────────

  /**
   * Lignes dont un champ identifiant vaut EXACTEMENT le texte (collation MySQL :
   * casse et accents ignorés). Indispensable pour les codes structurés :
   * numéros de dossier (DOS-2026-0001), références, e-mails, codes juridiction…
   */
  private async tryExactMatch(
    repo: import('typeorm').Repository<any>,
    searchFields: string[],
    searchTerm: string,
    additionalFilters?: Record<string, any>,
  ): Promise<any[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    const extra = additionalFilters ?? {};
    try {
      const rows = await repo.find({
        where: searchFields.map((field) => ({ [field]: term, ...extra })),
        take: 10,
      });
      return uniqueById(rows);
    } catch {
      // Une colonne incompatible fait échouer le OR : champ par champ.
      const rows: any[] = [];
      for (const field of searchFields) {
        try {
          rows.push(...(await repo.find({ where: { [field]: term, ...extra }, take: 10 })));
        } catch {
          /* colonne incompatible (type), on ignore */
        }
      }
      return uniqueById(rows);
    }
  }
}

const EMPTY_RESULT: ResolveResult<any> = {
  found: false,
  best: null,
  score: 0,
  matchedOn: '',
  candidates: [],
  ambiguous: false,
};

function uniqueById<T>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row: any) => {
    const key = String(row?.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
