// Migration SeedTransactionTypes - src/migrations/SeedTransactionTypes20250522123000.ts
// Cette migration pré-remplit la table transaction_type avec les types standards d'un core banking
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedTransactionTypes20250522123000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO core_banking.transaction_type (code, name, description, is_credit, fee_percentage)
      VALUES
        ('CASH_DEPOSIT',                'Dépôt en espèces',                  'Versement d''espèces en caisse',                            1, 0.00),
        ('CASH_WITHDRAWAL',             'Retrait en espèces',                'Retrait d''espèces au guichet ou ATM',                       0, 0.00),
        ('CHEQUE_DEPOSIT',              'Dépôt de chèque',                   'Versement de chèque en compte',                             1, 0.00),
        ('CHEQUE_CLEARING',             'Compensation de chèque',            'Remise et compensation de chèque',                          1, 0.00),
        ('INTERNAL_TRANSFER',           'Virement interne',                  'Transfert entre comptes de la même banque',                 0, 0.00),
        ('DOMESTIC_TRANSFER',           'Virement domestique',               'Virement national (SEPA, ACH, etc.)',                       0, 0.00),
        ('INTERNATIONAL_TRANSFER',      'Virement international',            'Virement SWIFT/MT101',                                      0, 0.00),
        ('STANDING_ORDER',              'Ordre permanent',                   'Virement périodique automatique',                           0, 0.00),
        ('DIRECT_DEBIT',                'Prélèvement automatique',           'Prélèvement sur compte via mandat',                         0, 0.00),
        ('CARD_PAYMENT',                'Paiement carte',                    'Paiement par carte de débit ou crédit',                     0, 0.00),
        ('CARD_REFUND',                 'Remboursement carte',               'Remboursement sur carte (chargeback)',                      1, 0.00),
        ('INTERBANK_DEBIT',             'Débit interbancaire',               'Prélèvement interbancaire',                                 0, 0.00),
        ('LOAN_DISBURSEMENT',           'Décaissement prêt',                 'Versement des fonds de prêt',                               1, 0.00),
        ('LOAN_PRINCIPAL_REPAYMENT',    'Remboursement capital',             'Remboursement du capital de prêt',                          0, 0.00),
        ('LOAN_INTEREST_PAYMENT',       'Paiement intérêts prêt',            'Remboursement des intérêts de prêt',                        0, 0.00),
        ('INTEREST_CREDIT',             'Crédit d''intérêts',                'Versement des intérêts créditeurs',                         1, 0.00),
        ('INTEREST_DEBIT',              'Débit d''intérêts',                 'Prélèvement des intérêts débiteurs',                        0, 0.00),
        ('ACCOUNT_MAINTENANCE_FEE',     'Frais de tenue de compte',          'Frais mensuels ou annuels de tenue de compte',             0, 0.00),
        ('OVERDRAFT_FEE',               'Frais de découvert',                'Frais appliqués en cas de dépassement de solde',           0, 0.00),
        ('LATE_PAYMENT_PENALTY',        'Pénalité de retard',                'Frais pour paiement en retard',                            0, 0.00),
        ('FX_BUY',                      'Achat de devises',                  'Achat de devises étrangères',                              0, 0.00),
        ('FX_SELL',                     'Vente de devises',                  'Vente de devises étrangères',                              1, 0.00),
        ('E_WALLET_DEPOSIT',            'Dépôt Mobile Money',                'Versement dans portefeuille mobile',                       1, 0.00),
        ('E_WALLET_WITHDRAWAL',         'Retrait Mobile Money',              'Retrait depuis portefeuille mobile',                       0, 0.00),
        ('INTERNET_BANKING_PAYMENT',    'Paiement en ligne',                 'Paiement via Internet Banking/API',                        0, 0.00),
        ('TRANSACTION_REVERSAL',        'Annulation / Reversal',             'Contre-passation d''une transaction précédente',            1, 0.00),
        ('MANUAL_ADJUSTMENT',           'Ajustement manuel',                 'Correction manuelle de solde',                              0, 0.00),
        ('BATCH_SETTLEMENT',            'Compensation lot',                  'Règlement par compensation de lots',                       0, 0.00),
        ('CASHBACK',                    'Cashback',                          'Remboursement promotionnel',                               1, 0.00),
        ('CHARGEBACK',                  'Chargeback',                        'Contestations de paiement retournées en crédit',           1, 0.00),
        ('AGENCY_COMMISSION',           'Commission agent',                  'Commission versée aux agents',                             0, 0.00),
        ('LOYALTY_POINTS_TRANSFER',     'Transfert points fidélité',         'Transfert de points fidélité entre comptes',               0, 0.00),
        ('PRODUCT_OPEN',                'Ouverture de produit',              'Événement d''ouverture de nouveau produit (non-monétaire)',1, 0.00),
        ('PRODUCT_CLOSE',               'Fermeture de produit',              'Événement de clôture de produit (non-monétaire)',          0, 0.00)
      ;
      `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM core_banking.transaction_type
      WHERE code IN (
        'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'CHEQUE_DEPOSIT', 'CHEQUE_CLEARING',
        'INTERNAL_TRANSFER', 'DOMESTIC_TRANSFER', 'INTERNATIONAL_TRANSFER', 'STANDING_ORDER',
        'DIRECT_DEBIT', 'CARD_PAYMENT', 'CARD_REFUND', 'INTERBANK_DEBIT',
        'LOAN_DISBURSEMENT', 'LOAN_PRINCIPAL_REPAYMENT', 'LOAN_INTEREST_PAYMENT',
        'INTEREST_CREDIT', 'INTEREST_DEBIT', 'ACCOUNT_MAINTENANCE_FEE',
        'OVERDRAFT_FEE', 'LATE_PAYMENT_PENALTY', 'FX_BUY', 'FX_SELL',
        'E_WALLET_DEPOSIT', 'E_WALLET_WITHDRAWAL', 'INTERNET_BANKING_PAYMENT',
        'TRANSACTION_REVERSAL', 'MANUAL_ADJUSTMENT', 'BATCH_SETTLEMENT',
        'CASHBACK', 'CHARGEBACK', 'AGENCY_COMMISSION', 'LOYALTY_POINTS_TRANSFER',
        'PRODUCT_OPEN', 'PRODUCT_CLOSE'
      );
      `
    );
  }
}