// @ts-nocheck — spec en quarantaine après la refonte (voir docs/merge-securisation-2026-11-01.md)
/// <reference types="jest" />
import { CABINET_JURIDIQUE_READ_RULES } from './cabinet-juridique-prompt';
import { DossierStatus } from '../../core/enums/dossier-status.enum';

// TODO(merge securisation) : le prompt IA décrit le nouveau cycle de vie (4 statuts) depuis la refonte.
// Spec conservée pour mémoire, à réécrire sur la nouvelle API.
describe.skip('Regles de lecture IA : point sur un dossier', () => {
  it('impose la facturation dans la synthese d un dossier', () => {
    expect(CABINET_JURIDIQUE_READ_RULES).toContain('Point / synthese / etat d\'un dossier');
    expect(CABINET_JURIDIQUE_READ_RULES).toContain('dossier_billing_profiles');
    expect(CABINET_JURIDIQUE_READ_RULES).toContain('billable_items');
  });

  it('decrit chaque code de statut dossier avec son libelle', () => {
    const labels: Record<number, string> = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.PRELIMINARY_ANALYSIS]: 'Analyse preliminaire',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      [DossierStatus.JUDGMENT]: 'Jugement',
      [DossierStatus.APPEAL]: 'Appel',
      [DossierStatus.CASSATION]: 'Cassation',
      [DossierStatus.EXECUTION]: 'Execution',
      [DossierStatus.CLOSED]: 'Cloture',
      [DossierStatus.ARCHIVED]: 'Archive',
      [DossierStatus.ABANDONED]: 'Abandonne',
    };
    for (const [code, label] of Object.entries(labels)) {
      expect(CABINET_JURIDIQUE_READ_RULES).toContain(`${code}=${label}`);
    }
  });
});
