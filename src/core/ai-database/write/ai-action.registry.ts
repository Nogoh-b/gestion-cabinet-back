// src/core/ai-database/write/ai-action.registry.ts
import { Injectable, Logger } from '@nestjs/common';

/**
 * Actions métier que le chat peut déclencher (envoi d'une facture, relance…)
 * en plus des écritures en base. Une action réutilise le service de l'écran
 * manuel : le chat n'envoie jamais rien que le bouton correspondant
 * n'enverrait pas.
 *
 * Dans un plan, elle prend la forme d'une opération « ACTION » :
 *   { operation: 'ACTION', action: 'envoyer_facture', entity: 'factures',
 *     entityId | match, fields: { …paramètres } }
 * Le plan qui en contient une demande toujours confirmation, et l'action ne
 * part qu'une fois le plan entier validé (cf. GenericWriteService).
 */

export interface AiActionParam {
  name: string;
  label: string;
  required?: boolean;
  /** Pour le planificateur (et la note de la carte de confirmation). */
  description?: string;
  /**
   * Champ de la carte de confirmation : texte court (défaut), texte long
   * (corps d'un message), date et heure, liste de choix ou choix multiple
   * (options fournies par `paramOptions` du handler).
   */
  kind?: 'text' | 'longtext' | 'datetime' | 'enum' | 'multi';
  /**
   * Corps de message enrichi : la carte propose gras + liens et un aperçu
   * fidèle à l'envoi (`email` : **gras** et [libellé](URL)).
   */
  format?: 'email' | 'whatsapp';
}

export interface AiActionDefinition {
  /** Identifiant utilisé dans le plan (« envoyer_facture »). */
  name: string;
  /** Table de l'enregistrement visé (« factures », « dossiers »). */
  entity: string;
  /**
   * Autres tables acceptées comme cible (ex. un e-mail lié à un dossier, une
   * audience ou une facture) : `op.entity` désigne alors la table visée.
   */
  targets?: string[];
  /**
   * Action proposée seulement par une compétence du chat (« # »), qui rédige
   * ses paramètres : absente du prompt du planificateur.
   */
  skillOnly?: boolean;
  /** Libellé court pour la carte et le compte rendu. */
  label: string;
  /** Ce que fait l'action, pour le planificateur. */
  description: string;
  /**
   * Permission exigée, la même que pour le bouton de l'écran manuel ('' si ce
   * bouton n'en exige aucune, ex. le composer d'e-mail).
   */
  permission: string;
  params: AiActionParam[];
  /** Exemples de demandes qui doivent produire cette action. */
  examples?: string[];
  /** Avertissement affiché sur la carte de confirmation. */
  warning?: string;
}

/** Action vérifiée, prête à partir quand le plan sera validé. */
export interface PreparedAiAction {
  /** Enregistrement visé (facture, dossier…), pour le lien du compte rendu. */
  data: Record<string, any>;
  /** Ce qui va être fait (« Facture FAC-… à envoyer à client@x.com »). */
  plannedMessage: string;
  /** Exécution réelle ; renvoie le message de réussite. */
  run: () => Promise<string>;
}

export interface AiActionHandler {
  readonly definition: AiActionDefinition;
  /**
   * Vérifie que l'action est possible (enregistrement visible, destinataire
   * connu…) et la prépare sans rien envoyer. Lève une erreur lisible sinon.
   * `table` : table visée (`definition.entity` ou l'une de `targets`).
   */
  prepare(targetId: string | number, params: Record<string, any>, userId: string, table?: string): Promise<PreparedAiAction>;
  /** Ce que la carte de confirmation doit annoncer (« À : client@x.com · 2 facture(s) »). */
  preview?(targetId: string | number, params: Record<string, any>, table?: string): Promise<string | undefined>;
  /** Choix proposés pour les paramètres `enum` / `multi` (modèles, pièces jointes…). */
  paramOptions?(targetId: string | number, table: string): Promise<Record<string, Array<{ value: string | number; label: string }>>>;
}

@Injectable()
export class AiActionRegistry {
  private readonly logger = new Logger(AiActionRegistry.name);
  private readonly handlers = new Map<string, AiActionHandler>();

  register(handler: AiActionHandler): void {
    this.handlers.set(handler.definition.name, handler);
    this.logger.log(`✅ Action IA enregistrée: ${handler.definition.name}`);
  }

  get(name: string | undefined | null): AiActionHandler | undefined {
    return name ? this.handlers.get(normalizeActionName(name)) : undefined;
  }

  all(): AiActionHandler[] {
    return [...this.handlers.values()];
  }

  /** Section « ACTIONS DISPONIBLES » du prompt du planificateur ('' sans action). */
  promptSection(): string {
    const handlers = this.all().filter((handler) => !handler.definition.skillOnly);
    if (!handlers.length) return '';
    const lines = handlers.map(({ definition: d }) => {
      const params = d.params.length
        ? d.params.map((p) => `${p.name}${p.required ? ' (requis)' : ' (facultatif)'}${p.description ? ` : ${p.description}` : ''}`).join(' ; ')
        : 'aucun';
      const examples = d.examples?.length ? `\n  Exemples de demandes : ${d.examples.map((e) => `« ${e} »`).join(', ')}` : '';
      return `- "${d.name}" (entity "${d.entity}") : ${d.description}\n  Paramètres (fields) : ${params}${examples}`;
    });
    return `## ⚡ ACTIONS DISPONIBLES (envois d'e-mails…)
Pour ENVOYER, RELANCER ou TRANSMETTRE, utilise une opération "ACTION" (jamais un UPDATE de statut pour simuler un envoi) :
{ "operation": "ACTION", "action": "<nom>", "entity": "<table>", "entityId": <id si connu>, "match": { … }, "fields": { …paramètres } }
${lines.join('\n')}
Cible de l'action : comme pour un UPDATE — l'identifiant #N des enregistrements affichés en "entityId", sinon "match"
avec les valeurs actuelles qui la désignent (ex: {"numero":"FAC-2026-0003"} ou {"dossier_number":"DOS-2026-0001"}).
Si l'enregistrement est créé dans le même plan, mets "entityId": "{{tempId.id}}" et place l'ACTION après sa création.
N'invente jamais d'adresse e-mail : laisse le paramètre absent pour utiliser celle du client.
`;
  }
}

/** Table visée par l'opération : `entity` du plan si l'action l'accepte. */
export function actionTargetTable(handler: AiActionHandler, entity?: string | null): string {
  const { definition } = handler;
  const wanted = String(entity ?? '').trim();
  return wanted && definition.targets?.includes(wanted) ? wanted : definition.entity;
}

/** « Envoyer facture », « envoyer-facture » → « envoyer_facture ». */
export function normalizeActionName(name: string): string {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
