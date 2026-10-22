// src/core/ai-database/skills/ai-skill.registry.ts
import { Injectable, Logger } from '@nestjs/common';

import { AiSkillHandler, DraftReference } from './ai-skill.types';
import type { ReferencedEntityContext } from '../dto/ask-question.dto';

/**
 * Faits d'un enregistrement mentionné (dossier, client…), lus avec les droits
 * de `user` ; la question choisit les sections détaillées (factures, pièces…).
 */
export type RecordFactsProvider = (references: ReferencedEntityContext[], user: any, question?: string) => Promise<string>;

/** Éléments insérables dans un brouillon (n° de dossier, adresse du client…). */
export type DraftReferencesProvider = (references: ReferencedEntityContext[], user: any) => Promise<DraftReference[]>;

/**
 * Compétences du chat, enregistrées par les modules métier dans leur
 * `onModuleInit` (comme les actions de `AiActionRegistry`).
 */
@Injectable()
export class AiSkillRegistry {
  private readonly logger = new Logger(AiSkillRegistry.name);
  private readonly handlers = new Map<string, AiSkillHandler>();
  /** Anciens codes fusionnés dans une compétence → sa compétence et son préremplissage. */
  private readonly aliases = new Map<string, { handler: AiSkillHandler; params: Record<string, unknown> }>();

  register(handler: AiSkillHandler): void {
    this.handlers.set(handler.definition.code, handler);
    for (const alias of handler.definition.aliases ?? []) {
      this.aliases.set(alias.code, { handler, params: alias.params ?? {} });
    }
    this.logger.log(`✅ Compétence IA enregistrée: ${handler.definition.code}`);
  }

  get(code: string | undefined | null): AiSkillHandler | undefined {
    if (!code) return undefined;
    const key = String(code).trim().toLowerCase();
    return this.handlers.get(key) ?? this.aliases.get(key)?.handler;
  }

  /** Préremplissage d'un ancien code (null pour un code courant). */
  aliasParams(code: string | undefined | null): Record<string, unknown> | null {
    if (!code) return null;
    return this.aliases.get(String(code).trim().toLowerCase())?.params ?? null;
  }

  all(): AiSkillHandler[] {
    return [...this.handlers.values()];
  }

  /**
   * Lecture des faits d'une fiche mentionnée, fournie par le module des
   * compétences (qui connaît les entités) : la conversation et le conseil
   * s'en servent quand l'utilisateur cite un dossier ou un client.
   */
  private factsProvider?: RecordFactsProvider;

  registerFactsProvider(provider: RecordFactsProvider): void {
    this.factsProvider = provider;
  }

  async recordFacts(references: ReferencedEntityContext[], user: any, question?: string): Promise<string> {
    if (!this.factsProvider || !references.length) return '';
    return this.factsProvider(references, user, question).catch(() => '');
  }

  /** Références de la fiche visée par un brouillon, fournies par le module des compétences. */
  private referencesProvider?: DraftReferencesProvider;

  registerReferencesProvider(provider: DraftReferencesProvider): void {
    this.referencesProvider = provider;
  }

  async draftReferences(references: ReferencedEntityContext[], user: any): Promise<DraftReference[]> {
    if (!this.referencesProvider || !references.length) return [];
    return this.referencesProvider(references, user).catch(() => []);
  }
}
