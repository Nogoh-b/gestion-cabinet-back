/**
 * Mode test des paiements (passerelle `test`, simulation, outils DEV).
 *
 * Jamais disponible en production. Hors production, actif par défaut ;
 * `PAYMENT_TEST_ENABLED=false` permet de le couper (ex. recette sur une
 * vraie passerelle en sandbox).
 */
export function isPaymentTestEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.PAYMENT_TEST_ENABLED !== 'false';
}
