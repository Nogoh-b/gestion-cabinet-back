import { AiContextConfigDto } from './dto/ai-context-config.dto';

const suggestion = (code: string, label: string, prompt: string, intent: 'read' | 'prepare' | 'write', sort_order: number) =>
  ({ code, label, prompt, intent, sort_order, enabled: true });
const config = (resource_type: string, scope: string, label: string, suggestions: AiContextConfigDto['suggestions']): AiContextConfigDto =>
  ({ resource_type, scope, operation_key: '*', label, instructions: '', enabled: true, suggestions });

/** Templates copied to tables by the migration; also cover newly created cabinets until customized. */
export const DEFAULT_AI_CONTEXT_CONFIGS: AiContextConfigDto[] = [
  config('*', '*', 'Assistant général', [
    suggestion('summary', 'Faire le point', 'Fais le point sur {resourceLabel} dans le contexte de cette page.', 'read', 0),
    suggestion('next', 'Prochaines actions', 'Quelles informations manquent et quelles sont les prochaines actions concernant {resourceLabel} ?', 'read', 1),
  ]),
  config('*', 'collection', 'Listes de ressources', [
    suggestion('summary', 'Analyser les résultats', 'Analyse les résultats de {resourceLabel} en respectant les filtres et la recherche de la page.', 'read', 0),
    suggestion('create', 'Créer une ressource', 'Aide-moi à créer une ressource dans {resourceLabel}. Demande les informations manquantes avant de préparer le plan.', 'write', 1),
  ]),
  config('*', 'selection', 'Sélections', [
    suggestion('summary', 'Résumer la sélection', 'Résume exclusivement les éléments sélectionnés de {resourceLabel}.', 'read', 0),
    suggestion('check', 'Vérifier la sélection', 'Vérifie exclusivement les éléments sélectionnés de {resourceLabel} et indique les informations manquantes.', 'read', 1),
  ]),
  ...['create', 'edit', 'complete', 'transition'].map((scope) => config('*', scope, `Formulaire · ${scope}`, [
    suggestion('check', 'Vérifier ce formulaire', 'Vérifie les valeurs actuelles du formulaire {formTitle} et explique ce qui manque avant sa validation.', 'read', 0),
    suggestion('draft', 'Préparer un brouillon', 'Propose les champs de {formTitle} uniquement à partir des faits présents dans le contexte. Signale les informations manquantes.', 'prepare', 1),
  ])),
  config('dossier_action', 'complete', 'Fin d’action', [
    suggestion('prerequisites', 'Vérifier les prérequis', 'Vérifie les résultats autorisés, les documents et les audiences nécessaires pour terminer cette action. Signale les prérequis manquants et les effets sur la facturation et les audiences.', 'read', 0),
    suggestion('report', 'Préparer le compte rendu', 'Prépare le compte rendu de fin d’action à partir des faits fournis. N’invente ni résultat, ni durée, ni date.', 'prepare', 1),
  ]),
];

export function matchAiContext<T extends { resource_type: string; scope: string; operation_key: string }>(configs: T[], resource: string, scope: string, operation = '*'): T | undefined {
  return configs.filter((config) => ['*', resource].includes(config.resource_type) && ['*', scope].includes(config.scope)
    && ['*', operation].includes(config.operation_key))
    .sort((a, b) => score(b) - score(a))[0];
  function score(config: T) { return (config.operation_key === operation && operation !== '*' ? 8 : 0)
    + (config.resource_type === resource && resource !== '*' ? 4 : 0) + (config.scope === scope && scope !== '*' ? 2 : 0); }
}
