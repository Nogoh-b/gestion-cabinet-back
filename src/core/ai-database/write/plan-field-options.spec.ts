import { fixedOptions, parseValueList, rowLabel } from './plan-field-options';

describe('plan-field-options', () => {
  describe('parseValueList', () => {
    it('lit « valeur=CLÉ/Libellé » et coupe à la fin de la phrase', () => {
      expect(parseValueList('BD: 1=ACTIVE/Actif, 0=INACTIVE/Inactif, -2=BLOCKED/Bloqué. En SQL utiliser le nombre.')).toEqual([
        { value: 1, label: 'Actif' },
        { value: 0, label: 'Inactif' },
        { value: -2, label: 'Bloqué' },
      ]);
    });

    it('humanise une clé sans libellé et lit les listes de chaînes', () => {
      expect(parseValueList('BD: 5=APPEAL/appel, 6=CASSATION')).toEqual([
        { value: 5, label: 'Appel' },
        { value: 6, label: 'Cassation' },
      ]);
      expect(parseValueList("BD: 'OUVERT' ou 'CLOTURE'.")).toEqual([
        { value: 'OUVERT', label: 'Ouvert' },
        { value: 'CLOTURE', label: 'Cloture' },
      ]);
      expect(parseValueList("BD: 'gross'=Brut, 'taxable'=Imposable.")).toEqual([
        { value: 'gross', label: 'Brut' },
        { value: 'taxable', label: 'Imposable' },
      ]);
    });

    it('accepte les paires numériques sans préfixe, refuse le texte libre', () => {
      expect(parseValueList('0=Normale, 1=Haute, 2=Prioritaire, 3=Urgent absolu')?.map((o) => o.label))
        .toEqual(['Normale', 'Haute', 'Prioritaire', 'Urgent absolu']);
      expect(parseValueList('Numéro de visite (1=première)')).toBeNull();
      expect(parseValueList('Nom du client, tel que saisi')).toBeNull();
      expect(parseValueList(undefined)).toBeNull();
    });
  });

  it("combine l'énumération de la colonne et les libellés de la description", () => {
    expect(fixedOptions({ type: 'enum', enum: [0, 1, 2] }, 'BD: 0=Faible, 1=Normal')).toEqual([
      { value: 0, label: 'Faible' },
      { value: 1, label: 'Normal' },
      { value: 2, label: '2' },
    ]);
    expect(fixedOptions({ type: 'boolean' })).toEqual([{ value: true, label: 'Oui' }, { value: false, label: 'Non' }]);
    expect(fixedOptions({ type: 'varchar' }, 'Adresse postale')).toBeNull();
  });

  it('nomme une ligne existante ou créée par le plan', () => {
    expect(rowLabel({ id: 4, full_name: 'OVAMBE NDONO', first_name: 'X' })).toBe('OVAMBE NDONO');
    expect(rowLabel({ first_name: 'Alexis', last_name: 'BINGOUNA' })).toBe('Alexis BINGOUNA');
    expect(rowLabel({ id: 2, name: 'Client particulier', code: 'PART' })).toBe('Client particulier (PART)');
    expect(rowLabel({ id: 9, dossier_number: 'DOS-2026-0001', object: 'Trouble de jouissance' }))
      .toBe('DOS-2026-0001 — Trouble de jouissance');
    expect(rowLabel({ id: 7, user: { first_name: 'Awa', last_name: 'Test' } })).toBe('Awa Test');
    expect(rowLabel({ id: 12 })).toBe('#12');
  });
});
