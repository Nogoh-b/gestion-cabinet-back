/// <reference types="jest" />
import * as Handlebars from 'handlebars';

import { validateReferenceTemplate } from '../reference-data/reference-template-validation';
import {
  actionRows,
  audienceRows,
  diligenceRows,
  documentRows,
  hoistLoops,
  invoiceRows,
  mergeMissing,
  nextAudience,
  paymentRows,
  TEMPLATE_LIST_REFERENCE,
  templateListKeys,
} from './template-context';
import { TemplateContextService } from './template-context.service';

const nbsp = (text: string) => text.replace(/[  ]/g, ' ');

describe('Contexte des modèles : listes et totaux', () => {
  it('met en forme les factures et calcule les totaux selon la règle commune (annulées hors totaux)', () => {
    const { rows, totals } = invoiceRows([
      { id: 'b', numero: 'F-2', montantTTC: 500, status: 5, dateFacture: '2026-02-01', paiements: [] },
      { id: 'a', numero: 'F-1', montantTTC: 1500, status: 1, dateFacture: '2026-01-10', dateEcheance: '2026-01-20', paiements: [{ montant: 1000, status: 1 }, { montant: 300, status: 0 }] },
    ] as any);
    expect(rows.map((row) => row.numero)).toEqual(['F-1', 'F-2']);
    expect(nbsp(rows[0].montant_ttc)).toBe('1 500');
    // Seuls les paiements validés comptent.
    expect(nbsp(rows[0].montant_paye)).toBe('1 000');
    expect(nbsp(rows[0].reste_a_payer)).toBe('500');
    expect(rows[0].en_retard).toBe('oui');
    expect(rows[1].statut).toBe('Annulée');
    expect(rows[1].reste_a_payer).toBe('0');
    expect(totals.nb_factures).toBe('2');
    expect(nbsp(totals.total_facture)).toBe('1 500');
    expect(nbsp(totals.total_encaisse)).toBe('1 000');
    expect(totals.total_reste).toBe('500');
  });

  it('écrit paiements, audiences, actions, diligences et pièces en clair (confidentiels exclus)', () => {
    expect(paymentRows([
      { datePaiement: '2026-03-02', montant: 250.5, modePaiement: 1, status: 1, numeroCheque: 'CH-9', facture: { numero: 'F-1' } },
      { datePaiement: '2026-03-01', montant: 10, modePaiement: 2, status: 0, deleted_at: '2026-03-03' },
    ])).toEqual([{ date: '02/03/2026', montant: '250,5', mode: 'Chèque', statut: 'Validé', reference: 'CH-9', facture: 'F-1' }]);
    expect(audienceRows([{ audience_date: '2026-05-04', audience_time: '09:30:00', jurisdiction: { name: 'TGI Douala' }, status: 2, postponed_to: '2026-06-01', audience_type: { name: 'Plaidoirie' } }])[0])
      .toMatchObject({ date: '04/05/2026', heure: '09:30', juridiction: 'TGI Douala', statut: 'Renvoyée', renvoi: '01/06/2026', type: 'Plaidoirie' });
    const users = new Map([[7, { first_name: 'Awa', last_name: 'Ngo' }]]);
    expect(actionRows([{ title: 'Signifier', status: 'IN_PROGRESS', priority: 'HIGH', due_at: '2026-04-01', responsible_user_id: 7 }], users)[0])
      .toMatchObject({ titre: 'Signifier', statut: 'En cours', priorite: 'Haute', echeance: '01/04/2026', responsable: 'Awa Ngo' });
    expect(diligenceRows([{ title: 'Visible', status: 'completed' }, { title: 'Secrète', confidential: true }]).map((row) => row.titre)).toEqual(['Visible']);
    expect(documentRows([{ name: 'Contrat.pdf', document_type: { name: 'Contrat' } }, { name: 'Interne', is_confidential: true }]).map((row) => row.nom)).toEqual(['Contrat.pdf']);
  });

  it('trouve la prochaine audience à venir, hors annulées', () => {
    const later = new Date(Date.now() + 10 * 86_400_000);
    const sooner = new Date(Date.now() + 2 * 86_400_000);
    expect(nextAudience([
      { audience_date: '2020-01-01' },
      { audience_date: sooner, status: 3 },
      { audience_date: later, audience_time: '14:00' },
    ])).toBe(`${later.toLocaleDateString('fr-FR')} à 14:00`);
  });

  it('complète le contexte existant sans écraser ce que l’appelant a déjà mis', () => {
    expect(mergeMissing(
      { dossier: { numero: 'D-1', prochaine_audience: '' }, title: 'x' },
      { dossier: { numero: 'autre', prochaine_audience: '01/01/2027', factures: [{ numero: 'F' }] }, client: { nom: 'C' } },
    )).toEqual({ dossier: { numero: 'D-1', prochaine_audience: '01/01/2027', factures: [{ numero: 'F' }] }, title: 'x', client: { nom: 'C' } });
  });

  it('répète la ligne de tableau entière et rend la liste avec Handlebars (mails)', () => {
    const body = '<table><tbody><tr><th>N°</th><th>Reste</th></tr><tr><td><p>{{#each dossier.factures}}{{numero}}</p></td><td><p>{{reste_a_payer}}{{/each}}</p></td></tr></tbody></table><p>Total : {{dossier.total_reste}}</p>';
    const hoisted = hoistLoops(body);
    expect(hoisted).toContain('{{#each dossier.factures}}<tr><td><p>{{numero}}</p></td><td><p>{{reste_a_payer}}</p></td></tr>{{/each}}');
    const html = Handlebars.compile(hoisted)({ dossier: { factures: [{ numero: 'F-1', reste_a_payer: '500' }, { numero: 'F-2', reste_a_payer: '0' }], total_reste: '500' } });
    expect(html).toBe('<table><tbody><tr><th>N°</th><th>Reste</th></tr><tr><td><p>F-1</p></td><td><p>500</p></td></tr><tr><td><p>F-2</p></td><td><p>0</p></td></tr></tbody></table><p>Total : 500</p>');
    // Boucle dans une seule cellule (liste en ligne) ou puce entière.
    expect(hoistLoops('<tr><td>{{#each x}}{{a}}, {{/each}}</td></tr>')).toBe('<tr><td>{{#each x}}{{a}}, {{/each}}</td></tr>');
    expect(hoistLoops('<ul><li><p>{{#each dossier.actions}}{{titre}}{{/each}}</p></li></ul>')).toBe('<ul>{{#each dossier.actions}}<li><p>{{titre}}</p></li>{{/each}}</ul>');
  });

  it('ne charge les listes d’un mail que si le modèle s’en sert, et les autorise à la validation', () => {
    expect(TEMPLATE_LIST_REFERENCE.test('{{#each dossier.factures}}')).toBe(true);
    expect(TEMPLATE_LIST_REFERENCE.test('Total {{dossier.total_reste}}')).toBe(true);
    expect(TEMPLATE_LIST_REFERENCE.test('{{dossier.numero}} {{facture.reste_a_payer}}')).toBe(false);
    expect(templateListKeys('client')).toContain('client.dossiers.numero');
    expect(templateListKeys('client')).not.toContain('dossier.factures');
    expect(TemplateContextService.isEntityType('facture')).toBe(true);
    expect(TemplateContextService.isEntityType('user')).toBe(false);
    const errors = validateReferenceTemplate({
      kind: 'mail_templates',
      values: { subject: 'Relevé', body_html: '{{#each dossier.factures}}{{numero}} {{reste_a_payer}}{{/each}} {{dossier.total_reste}}', variables: '["dossier.factures"]' },
    } as any);
    expect(errors).toEqual([]);
    expect(validateReferenceTemplate({
      kind: 'mail_templates',
      values: { subject: 'x', body_html: '{{#each dossier.factures}}{{mot_de_passe}}{{/each}}', variables: '[]' },
    } as any)).toContain('variable indisponible : dossier.factures.mot_de_passe');
  });
});
