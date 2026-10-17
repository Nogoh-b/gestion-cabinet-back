/// <reference types="jest" />
import { CABINET_JURIDIQUE_READ_RULES } from './cabinet-juridique-prompt';
import { DossierStatus } from '../../core/enums/dossier-status.enum';

describe('Regles de lecture IA : point sur un dossier', () => {
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
