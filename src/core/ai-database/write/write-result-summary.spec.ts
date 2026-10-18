/// <reference types="jest" />
import { parentIdsToLabel, resourceHref, summarizeWriteResults, SummaryLabels } from './write-result-summary';

const labels: SummaryLabels = {
  table: (entity) => ({ dossiers: 'Dossier', audiences: 'Audience', customer: 'Client' })[entity] ?? entity,
  column: (_entity, column) => ({ status: 'Statut', audience_date: "Date d'audience", object: 'Objet' })[column] ?? column,
  value: (_entity, column, value) => (column === 'status' && String(value) === '3' ? 'Passée' : null),
};

describe('Compte rendu d’un plan exécuté', () => {
  it('donne la référence, le lien et les champs de chaque création', () => {
    const message = summarizeWriteResults(
      [
        {
          success: true,
          operation: 'INSERT',
          entity: 'dossiers',
          entityId: 95,
          affected: 1,
          data: { id: 95, dossier_number: 'DOS-2026-0040', object: 'Trouble de jouissance', customer_id: 7 },
          changedFields: ['object', 'client'],
          message: 'ok',
        },
        {
          success: true,
          operation: 'INSERT',
          entity: 'audiences',
          entityId: 310,
          affected: 1,
          data: { id: 310, dossier_id: 95, audience_date: '2026-11-15', audience_time: '09:00:00' },
          changedFields: ['audience_date'],
          message: 'ok',
        },
      ],
      labels,
      new Map([['customer:7', 'OVAMBE NDONO'], ['dossiers:95', 'DOS-2026-0040 — Trouble de jouissance']]),
    );

    expect(message).toContain('✅ **Opération réussie** — 2 opérations effectuées.');
    expect(message).toContain('**🆕 Créé (2)**');
    expect(message).toContain('Dossier [DOS-2026-0040 — Trouble de jouissance](/dossiers/95) · Client [OVAMBE NDONO](/clients/7)');
    expect(message).toContain('Objet : Trouble de jouissance');
    expect(message).toContain('Audience [Audience du 15/11/2026 à 09:00](/audiences/310) · Dossier [DOS-2026-0040 — Trouble de jouissance](/dossiers/95)');
    expect(message).toContain("Date d'audience : 15/11/2026");
  });

  it('regroupe une mise à jour groupée et traduit les valeurs codées', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      success: true,
      operation: 'UPDATE' as const,
      entity: 'audiences',
      entityId: i + 1,
      affected: 1,
      data: { id: i + 1, dossier_id: 94, audience_date: '2025-10-15', status: 3 },
      changedFields: ['status'],
      message: 'ok',
    }));
    const message = summarizeWriteResults(results, labels);

    expect(message).toContain('**✏️ Mis à jour (10)**');
    expect(message).toContain('Statut : Passée');
    expect(message).toContain('- … et 2 autre(s)');
    expect(message).toContain('[#94](/dossiers/94)');
  });

  it('signale les doublons réutilisés et les échecs', () => {
    const message = summarizeWriteResults(
      [
        { success: true, operation: 'INSERT', entity: 'customer', entityId: 7, affected: 0, data: { id: 7, full_name: 'OVAMBE NDONO' }, message: 'existe' },
        { success: false, operation: 'UPDATE', entity: 'audiences', affected: 0, message: 'Audience introuvable' },
      ],
      labels,
    );
    expect(message).toContain('⚠️ **Opération partiellement réussie**');
    expect(message).toContain('**♻️ Déjà existant (réutilisé)**\n- Client [OVAMBE NDONO](/clients/7)');
    expect(message).toContain('**❌ Échecs**\n- Audience introuvable');
  });

  it('ne fait de lien que vers une fiche existante', () => {
    expect(resourceHref('dossier_actions', 5, { dossier_id: 94 })).toBe('/dossiers/94/actions');
    expect(resourceHref('paiements', 5, {})).toBeNull();
    expect(resourceHref('table_inconnue', 5)).toBeNull();
  });

  it('liste les parents à libeller', () => {
    const wanted = parentIdsToLabel([
      { success: true, operation: 'INSERT', entity: 'audiences', affected: 1, data: { dossier_id: 94 }, message: '' },
      { success: true, operation: 'INSERT', entity: 'dossiers', affected: 1, data: { dossier_id: 1, customer_id: 7 }, message: '' },
    ]);
    expect([...(wanted.get('dossiers') ?? [])]).toEqual([94]);
    expect([...(wanted.get('customer') ?? [])]).toEqual([7]);
  });
});
