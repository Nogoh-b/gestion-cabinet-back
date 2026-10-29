import { NotFoundException } from '@nestjs/common';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformCabinetsService } from './platform-cabinets.service';

/** Base minimale : une colonne `sidebar_badges_enabled` par cabinet. */
function stubDb(initial: Record<number, number>) {
  const state = { ...initial };
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (sql.startsWith('SELECT id FROM cabinets'))
      return params[0] in state ? [{ id: params[0] }] : [];
    if (sql.includes('sidebar_badges_enabled AS enabled'))
      return params[0] in state ? [{ enabled: state[params[0]] }] : [];
    if (sql.startsWith('UPDATE cabinets SET sidebar_badges_enabled')) {
      state[params[1]] = params[0];
      return [];
    }
    throw new Error('Requête inattendue : ' + sql);
  });
  return { query, state };
}

const service = (db: any) =>
  new PlatformCabinetsService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

describe('Plateforme — badges de la sidebar d’un cabinet', () => {
  it('est désactivé par défaut', async () => {
    expect(await service(stubDb({ 5: 0 })).sidebarBadges(5)).toEqual({ enabled: false });
  });

  it('active puis désactive pour ce seul cabinet, avec trace d’audit', async () => {
    const db = stubDb({ 5: 0, 6: 0 });
    const audit = jest.spyOn(PlatformAuditContext, 'set').mockImplementation(() => undefined);

    expect(await service(db).setSidebarBadges(5, true)).toEqual({ enabled: true });
    expect(db.state).toEqual({ 5: 1, 6: 0 });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cabinet.sidebar_badges',
        cabinetId: 5,
        before: { enabled: false },
        after: { enabled: true },
      }),
    );

    expect(await service(db).setSidebarBadges(5, false)).toEqual({ enabled: false });
    expect(db.state).toEqual({ 5: 0, 6: 0 });
    audit.mockRestore();
  });

  it('refuse un cabinet inconnu sans rien écrire', async () => {
    const db = stubDb({ 5: 0 });
    await expect(service(db).setSidebarBadges(99, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});
