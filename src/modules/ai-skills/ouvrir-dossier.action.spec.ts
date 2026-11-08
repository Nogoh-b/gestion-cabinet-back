import { BillingMode } from '../case-workflow/case-workflow.enums';
import { CommissionBasis } from '../referral/entities/dossier-referral.entity';
import { parseAmount, pickByName, toBillingMode, toCommissionBasis } from './ouvrir-dossier.action';

describe('ouvrir_dossier : lecture des paramètres', () => {
  it('lit les montants et pourcentages tels qu’ils sont écrits', () => {
    expect(parseAmount('1 500 000')).toBe(1500000);
    expect(parseAmount('19,25 %')).toBe(19.25);
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('n/a')).toBeUndefined();
  });

  it('déduit le mode de facturation', () => {
    expect(toBillingMode('Forfait + horaire', false, false, false)).toBe(BillingMode.MIXED);
    expect(toBillingMode(undefined, true, true, false)).toBe(BillingMode.MIXED);
    expect(toBillingMode('HOURLY', false, false, false)).toBe(BillingMode.HOURLY);
    expect(toBillingMode(undefined, true, false, false)).toBe(BillingMode.FIXED);
  });

  it('traduit la base de commission', () => {
    expect(toCommissionBasis('Facturé HT')).toBe(CommissionBasis.INVOICED_HT);
    expect(toCommissionBasis('encaissé TTC')).toBe(CommissionBasis.COLLECTED_TTC);
    expect(toCommissionBasis('invoiced_ht')).toBe(CommissionBasis.INVOICED_HT);
    expect(toCommissionBasis('')).toBeUndefined();
  });

  it('retrouve une fiche par son nom, sans deviner si plusieurs correspondent', () => {
    const people = [{ name: 'Sandrine Eyenga' }, { name: 'Thierry Fotso' }, { name: 'Thierry Mbarga' }];
    const nameOf = (item: { name: string }) => item.name;
    expect(pickByName(people, 'sandrine eyenga', nameOf)?.name).toBe('Sandrine Eyenga');
    expect(pickByName(people, 'Fotso', nameOf)?.name).toBe('Thierry Fotso');
    expect(pickByName(people, 'Thierry', nameOf)).toBeUndefined();
  });
});
