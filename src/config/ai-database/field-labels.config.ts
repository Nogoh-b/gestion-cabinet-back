/**
 * Labels lisibles pour les champs utilisés dans les messages d'ambiguïté.
 * Modifiable librement — n'impacte pas le module core AiDatabase.
 */
export const FIELD_LABELS: Record<string, string> = {
  client: 'client',
  lawyer: 'avocat référent',
  procedure_type: 'type de procédure',
  procedure_subtype: 'sous-type de procédure',
  jurisdiction: 'juridiction',
  dossier: 'dossier',
  facture: 'facture',
  employee: 'employé',
  branch: 'agence',
  referrer: "apporteur d'affaires",
};
