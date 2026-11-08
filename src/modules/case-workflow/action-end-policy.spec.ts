import { ForbiddenException } from '@nestjs/common';
import { assertCanEndDossierAction, canEndDossierAction } from './action-end-policy';

describe('canEndDossierAction', () => {
  const action = { responsible_user_id: 10 };
  const dossier = { lawyer_id: 20 };
  const user = (role: string) => ({ role, permissions: [] }) as any;

  it('autorise le responsable de la tâche, l’avocat du dossier et l’admin', () => {
    expect(canEndDossierAction(action, dossier, 10, user('collaborateur'))).toBe(true);
    expect(canEndDossierAction(action, dossier, 20, user('avocat'))).toBe(true);
    expect(canEndDossierAction(action, dossier, 30, user('admin'))).toBe(true);
  });

  it('refuse un autre collaborateur, même avocat', () => {
    expect(canEndDossierAction(action, dossier, 30, user('avocat'))).toBe(false);
  });

  it('laisse passer les traitements internes, sans utilisateur de requête', () => {
    expect(canEndDossierAction(action, dossier, 30, undefined)).toBe(true);
  });

  it('assert lève un 403 lisible hors requête autorisée', () => {
    jest.spyOn(require('src/core/security/request-user.context'), 'getCurrentRequestUser').mockReturnValue(user('avocat'));
    expect(() => assertCanEndDossierAction(action, dossier, 30)).toThrow(ForbiddenException);
    jest.restoreAllMocks();
  });
});
