import { describe, expect, it } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { RequestUserContext } from 'src/core/security/request-user.context';
import { UserRole } from 'src/core/enums/user-role.enum';

import {
  canBypassConfidentiality,
  isDossierVisible,
  shouldFilterConfidential,
} from './dossier-visibility';

const tenantContext = new TenantContext();
const userContext = new RequestUserContext();

const admin = { userId: 1, role: UserRole.ADMIN, permissions: [] };
const avocat = { userId: 2, role: UserRole.AVOCAT, permissions: [] };
const habilite = {
  userId: 3,
  role: UserRole.AVOCAT,
  permissions: ['view_dossier_confidential'],
};

const publicDossier = { id: 10, confidentiality_level: false };
const secretDossier = { id: 11, confidentiality_level: true };

/** Simule une requête HTTP authentifiée (tenant + utilisateur résolus). */
function asRequest<T>(user: any, fn: () => T): T {
  return tenantContext.run(1, () => userContext.run(user, fn));
}

/** Simule une requête HTTP sans utilisateur résolu (route mal protégée). */
function asAnonymousRequest<T>(fn: () => T): T {
  return tenantContext.run(1, fn);
}

describe('canBypassConfidentiality', () => {
  it("laisse passer l'administration du cabinet", () => {
    expect(asRequest(admin, () => canBypassConfidentiality())).toBe(true);
  });

  it('laisse passer le porteur de la permission dédiée', () => {
    expect(asRequest(habilite, () => canBypassConfidentiality())).toBe(true);
  });

  it("ne laisse pas passer un avocat ordinaire", () => {
    expect(asRequest(avocat, () => canBypassConfidentiality())).toBe(false);
  });

  it('accorde un accès complet hors requête HTTP (script, migration, cron)', () => {
    expect(canBypassConfidentiality()).toBe(true);
  });

  it('reste fermé dans une requête HTTP sans utilisateur résolu', () => {
    // Fail-closed : un jeton incomplet ou une route publique mal protégée ne
    // doit pas ouvrir les dossiers confidentiels.
    expect(asAnonymousRequest(() => canBypassConfidentiality())).toBe(false);
    expect(asAnonymousRequest(() => shouldFilterConfidential())).toBe(true);
  });
});

describe('isDossierVisible', () => {
  it('laisse voir un dossier non confidentiel par tout le monde', () => {
    expect(asRequest(avocat, () => isDossierVisible(publicDossier))).toBe(true);
    expect(asAnonymousRequest(() => isDossierVisible(publicDossier))).toBe(true);
  });

  it("laisse voir un dossier confidentiel à l'administration", () => {
    expect(asRequest(admin, () => isDossierVisible(secretDossier))).toBe(true);
  });

  it("masque un dossier confidentiel à un avocat sans autorisation", () => {
    expect(asRequest(avocat, () => isDossierVisible(secretDossier))).toBe(false);
  });

  it("masque un dossier confidentiel même à l'avocat affecté", () => {
    // L'affectation métier ne vaut pas droit de lecture : seule une
    // autorisation nominative ouvre le dossier.
    const avecAutreAutorisation = [999];
    expect(
      asRequest(avocat, () => isDossierVisible(secretDossier, avecAutreAutorisation)),
    ).toBe(false);
  });

  it('laisse voir un dossier confidentiel explicitement autorisé', () => {
    expect(
      asRequest(avocat, () => isDossierVisible(secretDossier, [11])),
    ).toBe(true);
  });

  it('accepte indifféremment un Set ou un tableau d’autorisations', () => {
    expect(
      asRequest(avocat, () => isDossierVisible(secretDossier, new Set([11]))),
    ).toBe(true);
  });

  it('masque un dossier confidentiel sans utilisateur résolu', () => {
    expect(asAnonymousRequest(() => isDossierVisible(secretDossier, [11]))).toBe(
      false,
    );
  });
});
