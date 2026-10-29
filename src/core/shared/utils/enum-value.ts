/**
 * Valeur à lier dans une requête SQL pour une colonne ENUM MariaDB
 * (`danger_level`, statuts de dossier, facture, paiement, document, audience…).
 *
 * Les enums TypeScript numériques sont stockés comme valeurs TEXTE
 * (`enum('0','1','2',…)`). Un nombre — paramètre OU littéral SQL — est lu par
 * MariaDB comme l'INDEX du membre : `status = 3` cible le 3e membre (« 2 »),
 * pas la valeur « 3 », et `status = 0` ne cible que la valeur d'erreur ''.
 * La forme chaîne désigne la valeur elle-même.
 */
export const enumValue = (value: number | string): string => String(value);
