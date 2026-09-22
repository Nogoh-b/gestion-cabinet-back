import { describe, it, expect } from '@jest/globals';
import {
  buildEntityMailContext,
  MAIL_VARIABLE_GROUPS,
} from './mail-variables';

describe('buildEntityMailContext - namespace action', () => {
  it('expose le namespace action dans le catalogue', () => {
    const group = MAIL_VARIABLE_GROUPS.find((g) => g.namespace === 'action');

    expect(group).toBeDefined();
    expect(group!.variables.map((v) => v.key)).toEqual([
      'action.titre',
      'action.statut',
      'action.priorite',
      'action.echeance',
      'action.responsable',
      'action.nb_reports',
      'action.dernier_motif_report',
    ]);
  });

  it('remplit action.* depuis une action explicite', () => {
    const ctx = buildEntityMailContext({
      dossier: { dossier_number: 'DOS-001' },
      action: {
        title: 'Rediger conclusions',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        due_at: '2026-10-01',
        responsible: { full_name: 'Me Dupont' },
        deadlineExtensions: {
          count: 2,
          history: [
            { date: '2026-09-05', previousDueAt: '2026-09-10', dueAt: '2026-09-20', reason: null },
            { date: '2026-09-18', previousDueAt: '2026-09-20', dueAt: '2026-10-01', reason: 'Attente piece adverse' },
          ],
        },
      },
    });

    expect(ctx.action.titre).toBe('Rediger conclusions');
    expect(ctx.action.statut).toBe('En cours');
    expect(ctx.action.priorite).toBe('Haute');
    expect(ctx.action.echeance).toBe('01/10/2026');
    expect(ctx.action.responsable).toBe('Me Dupont');
    expect(ctx.action.nb_reports).toBe('2');
    expect(ctx.action.dernier_motif_report).toBe('Attente piece adverse');
  });

  it('derive action.* depuis une diligence liee (source_action)', () => {
    const ctx = buildEntityMailContext({
      resourceType: 'diligence',
      resource: {
        title: 'Diligence liee',
        source_action: {
          id: 'action-uuid-1',
          title: 'Rediger conclusions',
          status: 'TODO',
          priority: 'NORMAL',
          due_at: '2026-09-15',
        },
        deadline_extensions: { count: 0, history: [] },
      },
    });

    expect(ctx.action.titre).toBe('Rediger conclusions');
    expect(ctx.action.statut).toBe('À faire');
    expect(ctx.action.nb_reports).toBe('');
  });

  it('retourne des chaines vides sans action', () => {
    const ctx = buildEntityMailContext({
      resourceType: 'diligence',
      resource: { title: 'Diligence autonome' },
    });

    expect(ctx.action).toEqual({
      titre: '',
      statut: '',
      priorite: '',
      echeance: '',
      responsable: '',
      nb_reports: '',
      dernier_motif_report: '',
    });
  });
});
