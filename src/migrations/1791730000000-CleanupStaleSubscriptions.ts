import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Règle « un seul abonnement vivant par cabinet » appliquée à l'historique :
 * avant cette règle, un changement de plan pendant une attente de paiement
 * laissait d'anciens abonnements `pending_payment` / `expired` / `suspended`
 * ouverts. Tous les abonnements non annulés autres que le plus récent du
 * cabinet sont clos, et leurs échéances encore dues annulées.
 *
 * Idempotent ; non réversible (l'état antérieur était incohérent).
 */
export class CleanupStaleSubscriptions1791730000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE subscription_payments sp
        JOIN subscriptions s ON s.id = sp.subscription_id
        JOIN (SELECT cabinet_id, MAX(id) AS keep_id
                FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id) k
          ON k.cabinet_id = s.cabinet_id
         SET sp.status = 'cancelled',
             sp.notes = 'Échéance d''un abonnement remplacé'
       WHERE s.status <> 'cancelled' AND s.id <> k.keep_id
         AND sp.status IN ('pending','awaiting_validation')
    `);
    await q.query(`
      UPDATE subscriptions s
        JOIN (SELECT cabinet_id, MAX(id) AS keep_id
                FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id) k
          ON k.cabinet_id = s.cabinet_id
         SET s.status = 'cancelled',
             s.cancelled_at = COALESCE(s.cancelled_at, NOW()),
             s.cancel_reason = COALESCE(s.cancel_reason, 'replaced')
       WHERE s.status <> 'cancelled' AND s.id <> k.keep_id
    `);
  }

  public async down(): Promise<void> {
    // Volontairement sans effet : l'état antérieur était incohérent.
  }
}
