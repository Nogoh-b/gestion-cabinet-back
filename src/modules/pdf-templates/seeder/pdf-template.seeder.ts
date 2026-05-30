import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { PdfTemplate } from '../entities/pdf-template.entity';

/**
 * Variables disponibles pour les modèles « facture ».
 * Le front (renderPdfTemplate) enrichit la donnée brute avec ces clés
 * (champs formatés `_fmt` + blocs HTML pré-rendus comme `paiementsRows`).
 */
const FACTURE_VARS = JSON.stringify([
  'cabinetName',
  'numero',
  'dateFacture_fmt',
  'dateEcheance_fmt',
  'statut_label',
  'client.full_name',
  'client.email',
  'client.number_phone_1',
  'client.address',
  'dossier.dossier_number',
  'dossier.object',
  'dossier.court_name',
  'montantHT_fmt',
  'tauxTVA',
  'montantTVA_fmt',
  'montantTTC_fmt',
  'totalPaid_fmt',
  'remaining_fmt',
  'paiementsRows',
  'description',
  'notesInternes',
  'generatedAt_fmt',
  'year',
]);

const FACTURE_STANDARD = `
<div style="padding: 16px;">
  <div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1e3a8a;">
    <div style="font-size:20px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:16px; font-weight:bold; color:#0f172a;">FACTURE</div>
    <div style="font-size:11px; color:#475569;">N° {{numero}}</div>
  </div>

  <table style="width:100%; margin-bottom:18px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:8px;">
        <div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">
          <div style="font-size:11px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">CLIENT</div>
          <div style="font-weight:bold;">{{client.full_name}}</div>
          <div style="font-size:10px; color:#475569;">{{client.email}}<br/>{{client.number_phone_1}}<br/>{{client.address}}</div>
        </div>
      </td>
      <td style="width:50%; vertical-align:top; padding-left:8px;">
        <div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">
          <div style="font-size:11px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">INFORMATIONS</div>
          <div><strong>Date d'émission :</strong> {{dateFacture_fmt}}</div>
          <div><strong>Date d'échéance :</strong> {{dateEcheance_fmt}}</div>
          <div><strong>Statut :</strong> {{statut_label}}</div>
        </div>
      </td>
    </tr>
  </table>

  <h2>Référence dossier</h2>
  <div style="background:#f8fafc; padding:8px;">
    <div><strong>N° Dossier :</strong> {{dossier.dossier_number}}</div>
    <div><strong>Objet :</strong> {{dossier.object}}</div>
    <div><strong>Juridiction :</strong> {{dossier.court_name}}</div>
  </div>

  <h2>Détails financiers</h2>
  <table style="width:100%;">
    <thead>
      <tr><th>Désignation</th><th style="text-align:right;">Montant</th></tr>
    </thead>
    <tbody>
      <tr><td>Montant HT</td><td style="text-align:right;">{{montantHT_fmt}}</td></tr>
      <tr><td>TVA ({{tauxTVA}}%)</td><td style="text-align:right;">{{montantTVA_fmt}}</td></tr>
      <tr style="background:#f1f5f9; font-weight:bold;"><td>TOTAL TTC</td><td style="text-align:right;">{{montantTTC_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Historique des paiements</h2>
  <table style="width:100%;">
    <thead><tr><th>Date</th><th>Mode</th><th style="text-align:right;">Montant</th><th>Référence</th></tr></thead>
    <tbody>{{paiementsRows}}</tbody>
  </table>
  <div style="margin-top:6px;"><strong>Total payé :</strong> {{totalPaid_fmt}} &nbsp;—&nbsp; <strong>Solde restant dû :</strong> {{remaining_fmt}}</div>

  <div class="footer">Document généré le {{generatedAt_fmt}} — {{cabinetName}} © {{year}}</div>
</div>
`;

const FACTURE_COMPTABLE = `
<div style="padding:16px;">
  <div style="border-bottom:2px solid #0f766e; padding-bottom:8px; margin-bottom:14px;">
    <div style="font-size:18px; font-weight:bold; color:#0f766e;">EXPORT COMPTABLE</div>
    <div style="font-size:11px; color:#475569;">{{cabinetName}} — Pièce N° {{numero}}</div>
  </div>

  <table style="width:100%;">
    <thead><tr><th>Champ</th><th>Valeur</th></tr></thead>
    <tbody>
      <tr><td>Numéro de pièce</td><td>{{numero}}</td></tr>
      <tr><td>Date d'émission</td><td>{{dateFacture_fmt}}</td></tr>
      <tr><td>Date d'échéance</td><td>{{dateEcheance_fmt}}</td></tr>
      <tr><td>Tiers (client)</td><td>{{client.full_name}}</td></tr>
      <tr><td>Référence dossier</td><td>{{dossier.dossier_number}}</td></tr>
      <tr><td>Statut</td><td>{{statut_label}}</td></tr>
    </tbody>
  </table>

  <h2>Ventilation fiscale</h2>
  <table style="width:100%;">
    <thead><tr><th>Libellé</th><th style="text-align:right;">Base / Taux</th><th style="text-align:right;">Montant</th></tr></thead>
    <tbody>
      <tr><td>Base HT</td><td style="text-align:right;">—</td><td style="text-align:right;">{{montantHT_fmt}}</td></tr>
      <tr><td>TVA collectée</td><td style="text-align:right;">{{tauxTVA}}%</td><td style="text-align:right;">{{montantTVA_fmt}}</td></tr>
      <tr style="background:#f1f5f9; font-weight:bold;"><td>Total TTC</td><td style="text-align:right;"></td><td style="text-align:right;">{{montantTTC_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Règlements</h2>
  <table style="width:100%;">
    <thead><tr><th>Date</th><th>Mode</th><th style="text-align:right;">Montant</th><th>Référence</th></tr></thead>
    <tbody>{{paiementsRows}}</tbody>
  </table>
  <div style="margin-top:6px;"><strong>Total encaissé :</strong> {{totalPaid_fmt}} — <strong>Reste à recouvrer :</strong> {{remaining_fmt}}</div>

  <div class="footer">Export comptable généré le {{generatedAt_fmt}} — Usage interne / cabinet — {{cabinetName}}</div>
</div>
`;

const FACTURE_CLIENT = `
<div style="padding:18px;">
  <div style="text-align:center; margin-bottom:18px;">
    <div style="font-size:22px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:13px; color:#64748b;">Facture N° {{numero}} — {{dateFacture_fmt}}</div>
  </div>

  <p>Cher(e) <strong>{{client.full_name}}</strong>,</p>
  <p>Veuillez trouver ci-dessous le récapitulatif de votre facture relative au dossier <strong>{{dossier.object}}</strong> (réf. {{dossier.dossier_number}}).</p>

  <table style="width:100%; margin-top:10px;">
    <tbody>
      <tr><td>Montant HT</td><td style="text-align:right;">{{montantHT_fmt}}</td></tr>
      <tr><td>TVA ({{tauxTVA}}%)</td><td style="text-align:right;">{{montantTVA_fmt}}</td></tr>
      <tr style="background:#eef2ff; font-weight:bold;"><td>Total à régler</td><td style="text-align:right;">{{montantTTC_fmt}}</td></tr>
      <tr><td>Déjà réglé</td><td style="text-align:right;">{{totalPaid_fmt}}</td></tr>
      <tr style="font-weight:bold; color:#b45309;"><td>Solde restant dû</td><td style="text-align:right;">{{remaining_fmt}}</td></tr>
    </tbody>
  </table>

  <p style="margin-top:14px;">Échéance de règlement : <strong>{{dateEcheance_fmt}}</strong>.</p>
  <p>Nous vous remercions de votre confiance.</p>

  <div class="footer">{{cabinetName}} © {{year}} — Document émis le {{generatedAt_fmt}}</div>
</div>
`;

export default class PdfTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(PdfTemplate);

    const templates: Partial<PdfTemplate>[] = [
      {
        code: 'facture_standard',
        name: 'Facture — Standard',
        entity_type: 'facture',
        variant: 'standard',
        description: 'Facture complète remise au client (montants, paiements, solde).',
        title: 'FACTURE',
        body_html: FACTURE_STANDARD,
        variables: FACTURE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'facture_comptable',
        name: 'Facture — Export comptable',
        entity_type: 'facture',
        variant: 'comptable',
        description: 'Version destinée à la comptabilité : ventilation fiscale HT/TVA/TTC et règlements.',
        title: 'EXPORT COMPTABLE',
        body_html: FACTURE_COMPTABLE,
        variables: FACTURE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'facture_client',
        name: 'Facture — Version client',
        entity_type: 'facture',
        variant: 'client',
        description: 'Version commerciale allégée adressée au client.',
        title: 'FACTURE',
        body_html: FACTURE_CLIENT,
        variables: FACTURE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
    ];

    for (const data of templates) {
      const existing = await repository.findOne({ where: { code: data.code } });
      if (!existing) {
        await repository.save(repository.create(data));
        console.log(`Modèle PDF créé : ${data.name} (${data.code})`);
      } else {
        console.log(`Modèle PDF déjà existant, ignoré : ${data.code}`);
      }
    }
  }
}
