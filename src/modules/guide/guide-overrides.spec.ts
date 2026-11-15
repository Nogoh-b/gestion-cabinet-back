import { filterForViewer, isEmptyGuideData, matchesAudience, sanitizeGuideData, GuideViewer } from './guide-overrides';

const viewer = (patch: Partial<GuideViewer> = {}): GuideViewer => ({
  permissions: ['view_dossiers'],
  isAdmin: false,
  profile: 'avocat',
  plan: { ai: true, invoicing: false },
  ...patch,
});

describe('matchesAudience', () => {
  it('sans audience : tout le monde', () => {
    expect(matchesAudience(undefined, viewer())).toBe(true);
    expect(matchesAudience({}, viewer())).toBe(true);
  });

  it('permissions : toutes par défaut, au moins une avec anyPermission', () => {
    expect(matchesAudience({ permissions: ['view_dossiers', 'view_audiences'] }, viewer())).toBe(false);
    expect(matchesAudience({ permissions: ['view_dossiers', 'view_audiences'], anyPermission: true }, viewer())).toBe(true);
  });

  it("l'administrateur a toutes les permissions, mais pas un module absent du forfait", () => {
    const admin = viewer({ isAdmin: true, permissions: [] });
    expect(matchesAudience({ permissions: ['edit_user'] }, admin)).toBe(true);
    expect(matchesAudience({ planFlags: ['invoicing'] }, admin)).toBe(false);
  });

  it('forfait : sans forfait on n’empêche rien', () => {
    expect(matchesAudience({ planFlags: ['ai'] }, viewer())).toBe(true);
    expect(matchesAudience({ planFlags: ['invoicing'] }, viewer({ plan: null }))).toBe(true);
  });

  it("métier : s'applique à tous, administrateur compris", () => {
    expect(matchesAudience({ profiles: ['comptable'] }, viewer())).toBe(false);
    expect(matchesAudience({ profiles: ['comptable'] }, viewer({ isAdmin: true }))).toBe(false);
    expect(matchesAudience({ profiles: ['avocat', 'comptable'] }, viewer())).toBe(true);
  });
});

describe('filterForViewer', () => {
  it('masque le contenu réservé sans renvoyer son texte ni son audience', () => {
    const out = filterForViewer(
      [
        { kind: 'step', target: 'page:dossier#step:a', data: { title: 'Secret', audience: { permissions: ['edit_user'] } } },
        { kind: 'step', target: 'page:dossier#step:b', data: { title: 'Public', audience: { permissions: ['view_dossiers'] } } },
      ],
      viewer(),
    );
    expect(out).toEqual([
      { kind: 'step', target: 'page:dossier#step:a', data: { hidden: true } },
      { kind: 'step', target: 'page:dossier#step:b', data: { title: 'Public' } },
    ]);
  });

  it('nouveautés : filtre les éléments et retire une livraison vide', () => {
    const out = filterForViewer(
      [
        {
          kind: 'release',
          target: 'release:2026-11-15',
          data: { title: 'Lot', items: [{ id: 'a', audience: { planFlags: ['invoicing'] } }, { id: 'b' }] },
        },
        { kind: 'release', target: 'release:2026-11-16', data: { title: 'Vide', items: [{ id: 'c', audience: { profiles: ['admin'] } }] } },
      ],
      viewer(),
    );
    expect(out).toEqual([{ kind: 'release', target: 'release:2026-11-15', data: { title: 'Lot', items: [{ id: 'b' }] } }]);
  });
});

describe('sanitizeGuideData / isEmptyGuideData', () => {
  it('refuse un tableau, accepte vide', () => {
    expect(() => sanitizeGuideData(['x'])).toThrow();
    expect(sanitizeGuideData(null)).toEqual({});
  });

  it('un brouillon sans champ revient à l’origine', () => {
    expect(isEmptyGuideData({})).toBe(true);
    expect(isEmptyGuideData({ title: null })).toBe(true);
    expect(isEmptyGuideData({ hidden: false })).toBe(false);
  });
});
