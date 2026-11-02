/**
 * Moyens de paiement (factures fournisseurs, remboursements de notes de frais).
 *
 * Enum isolé dans son propre module : `supplier-invoice.entity` et
 * `expense-report.entity` l'utilisent tous les deux et s'importent
 * mutuellement (via `expense-line`), ce qui rendait l'enum `undefined` au
 * moment de la décoration TypeORM et empêchait la DataSource de démarrer.
 */
export enum PaymentMethod {
  ESPECES = 'ESPECES',
  CHEQUE = 'CHEQUE',
  VIREMENT = 'VIREMENT',
  CARTE_BANCAIRE = 'CARTE_BANCAIRE',
  PRELEVEMENT = 'PRELEVEMENT',
  MOBILE_MONEY = 'MOBILE_MONEY',
}
