import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { PdfTemplate } from '../entities/pdf-template.entity';

/**
 * Seeder des modèles PDF par défaut.
 *
 * Chaque type d'entité (facture, dossier, client, audience, diligence, general)
 * dispose d'une ou plusieurs variantes prêtes à l'emploi et entièrement
 * modifiables depuis l'interface « Modèles PDF ». Les modèles `is_system`
 * restent éditables (titre, corps, variante…) ; seuls leur `code` et leur
 * suppression sont protégés (on les désactive au lieu de les supprimer).
 *
 * Le corps (`body_html`) est un gabarit HTML contenant des variables `{{var}}`
 * interpolées au moment du rendu (moteur PDF côté front). Les clés `_fmt`
 * correspondent à des valeurs déjà formatées (dates, montants) et les blocs
 * `*Rows` à du HTML pré-rendu (lignes de tableau).
 */

/* ════════════════════════════════════════════════════════════════════════
 *  FACTURES
 * ════════════════════════════════════════════════════════════════════════ */

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

/* ════════════════════════════════════════════════════════════════════════
 *  DOSSIERS
 * ════════════════════════════════════════════════════════════════════════ */

const DOSSIER_VARS = JSON.stringify([
  'cabinetName',
  'dossier_number',
  'object',
  'status_label',
  'danger_level',
  'priority_level',
  'court_name',
  'case_number',
  'opposing_party_name',
  'opposing_party_lawyer',
  'openingDate_fmt',
  'closingDate_fmt',
  'client.full_name',
  'client.email',
  'client.number_phone_1',
  'client.address',
  'lawyer.full_name',
  'procedureType.name',
  'budgetEstimate_fmt',
  'actualCosts_fmt',
  'initial_request',
  'next_steps',
  'final_decision',
  'audiencesRows',
  'diligencesRows',
  'generatedAt_fmt',
  'year',
]);

const DOSSIER_STANDARD = `
<div style="padding:16px;">
  <div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1e3a8a;">
    <div style="font-size:20px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:16px; font-weight:bold; color:#0f172a;">FICHE DOSSIER</div>
    <div style="font-size:11px; color:#475569;">N° {{dossier_number}}</div>
  </div>

  <table style="width:100%; margin-bottom:16px;">
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
          <div style="font-size:11px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">SUIVI</div>
          <div><strong>Avocat référent :</strong> {{lawyer.full_name}}</div>
          <div><strong>Statut :</strong> {{status_label}}</div>
          <div><strong>Priorité :</strong> {{priority_level}}</div>
          <div><strong>Niveau de risque :</strong> {{danger_level}}</div>
        </div>
      </td>
    </tr>
  </table>

  <h2>Objet du dossier</h2>
  <p>{{object}}</p>

  <h2>Procédure & juridiction</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td>Type de procédure</td><td>{{procedureType.name}}</td></tr>
      <tr><td>Juridiction</td><td>{{court_name}}</td></tr>
      <tr><td>N° de rôle</td><td>{{case_number}}</td></tr>
      <tr><td>Partie adverse</td><td>{{opposing_party_name}}</td></tr>
      <tr><td>Avocat adverse</td><td>{{opposing_party_lawyer}}</td></tr>
      <tr><td>Date d'ouverture</td><td>{{openingDate_fmt}}</td></tr>
      <tr><td>Date de clôture</td><td>{{closingDate_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Aspects financiers</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td>Budget estimé</td><td style="text-align:right;">{{budgetEstimate_fmt}}</td></tr>
      <tr><td>Coûts engagés</td><td style="text-align:right;">{{actualCosts_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Demande initiale</h2>
  <p>{{initial_request}}</p>

  <h2>Prochaines étapes</h2>
  <p>{{next_steps}}</p>

  <div class="footer">Fiche générée le {{generatedAt_fmt}} — {{cabinetName}} © {{year}}</div>
</div>
`;

const DOSSIER_SYNTHESE = `
<div style="padding:16px;">
  <div style="border-bottom:2px solid #7c3aed; padding-bottom:8px; margin-bottom:14px;">
    <div style="font-size:18px; font-weight:bold; color:#7c3aed;">SYNTHÈSE DE DOSSIER</div>
    <div style="font-size:11px; color:#475569;">{{cabinetName}} — Dossier N° {{dossier_number}}</div>
  </div>

  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Client</td><td>{{client.full_name}}</td></tr>
      <tr><td>Objet</td><td>{{object}}</td></tr>
      <tr><td>Avocat référent</td><td>{{lawyer.full_name}}</td></tr>
      <tr><td>Juridiction</td><td>{{court_name}}</td></tr>
      <tr><td>Partie adverse</td><td>{{opposing_party_name}}</td></tr>
      <tr><td>Statut</td><td>{{status_label}}</td></tr>
      <tr><td>Ouverture</td><td>{{openingDate_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Audiences</h2>
  <table style="width:100%;">
    <thead><tr><th>Date</th><th>Juridiction</th><th>Type</th><th>Issue</th></tr></thead>
    <tbody>{{audiencesRows}}</tbody>
  </table>

  <h2>Diligences</h2>
  <table style="width:100%;">
    <thead><tr><th>Intitulé</th><th>Échéance</th><th>Statut</th></tr></thead>
    <tbody>{{diligencesRows}}</tbody>
  </table>

  <h2>Décision / conclusion</h2>
  <p>{{final_decision}}</p>

  <div class="footer">Synthèse générée le {{generatedAt_fmt}} — Usage interne — {{cabinetName}}</div>
</div>
`;

const DOSSIER_CLIENT = `
<div style="padding:18px;">
  <div style="text-align:center; margin-bottom:18px;">
    <div style="font-size:22px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:13px; color:#64748b;">Point sur votre dossier — réf. {{dossier_number}}</div>
  </div>

  <p>Cher(e) <strong>{{client.full_name}}</strong>,</p>
  <p>Nous vous présentons l'état d'avancement de votre dossier relatif à <strong>{{object}}</strong>.</p>

  <table style="width:100%; margin-top:10px;">
    <tbody>
      <tr><td>Juridiction saisie</td><td>{{court_name}}</td></tr>
      <tr><td>Avocat en charge</td><td>{{lawyer.full_name}}</td></tr>
      <tr><td>Statut actuel</td><td>{{status_label}}</td></tr>
      <tr><td>Ouvert le</td><td>{{openingDate_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Prochaines étapes</h2>
  <p>{{next_steps}}</p>

  <p style="margin-top:14px;">Nous restons à votre disposition pour tout complément d'information.</p>

  <div class="footer">{{cabinetName}} © {{year}} — Document émis le {{generatedAt_fmt}}</div>
</div>
`;

/* ════════════════════════════════════════════════════════════════════════
 *  CLIENTS
 * ════════════════════════════════════════════════════════════════════════ */

const CLIENT_VARS = JSON.stringify([
  'cabinetName',
  'customer_code',
  'full_name',
  'company_name',
  'email',
  'number_phone_1',
  'number_phone_2',
  'professional_phone',
  'address',
  'postal_code',
  'country',
  'reference',
  'siret',
  'tva_number',
  'legal_form',
  'dossiersCount',
  'facturesCount',
  'totalFacture_fmt',
  'totalPaid_fmt',
  'dossiersRows',
  'generatedAt_fmt',
  'year',
]);

const CLIENT_FICHE = `
<div style="padding:16px;">
  <div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1e3a8a;">
    <div style="font-size:20px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:16px; font-weight:bold; color:#0f172a;">FICHE CLIENT</div>
    <div style="font-size:11px; color:#475569;">Réf. {{customer_code}}</div>
  </div>

  <table style="width:100%; margin-bottom:16px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:8px;">
        <div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">
          <div style="font-size:11px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">IDENTITÉ</div>
          <div style="font-weight:bold;">{{full_name}}</div>
          <div style="font-size:10px; color:#475569;">{{company_name}}</div>
        </div>
      </td>
      <td style="width:50%; vertical-align:top; padding-left:8px;">
        <div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">
          <div style="font-size:11px; font-weight:bold; color:#1e3a8a; margin-bottom:6px;">CONTACT</div>
          <div>{{email}}</div>
          <div>{{number_phone_1}} / {{number_phone_2}}</div>
          <div>{{address}}, {{postal_code}} {{country}}</div>
        </div>
      </td>
    </tr>
  </table>

  <h2>Informations légales</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td>SIRET</td><td>{{siret}}</td></tr>
      <tr><td>N° TVA</td><td>{{tva_number}}</td></tr>
      <tr><td>Forme juridique</td><td>{{legal_form}}</td></tr>
      <tr><td>Référence interne</td><td>{{reference}}</td></tr>
    </tbody>
  </table>

  <h2>Activité</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td>Nombre de dossiers</td><td style="text-align:right;">{{dossiersCount}}</td></tr>
      <tr><td>Nombre de factures</td><td style="text-align:right;">{{facturesCount}}</td></tr>
      <tr><td>Total facturé</td><td style="text-align:right;">{{totalFacture_fmt}}</td></tr>
      <tr><td>Total réglé</td><td style="text-align:right;">{{totalPaid_fmt}}</td></tr>
    </tbody>
  </table>

  <h2>Dossiers</h2>
  <table style="width:100%;">
    <thead><tr><th>N° Dossier</th><th>Objet</th><th>Statut</th></tr></thead>
    <tbody>{{dossiersRows}}</tbody>
  </table>

  <div class="footer">Fiche générée le {{generatedAt_fmt}} — {{cabinetName}} © {{year}}</div>
</div>
`;

const CLIENT_ATTESTATION = `
<div style="padding:20px;">
  <div style="text-align:center; margin-bottom:24px;">
    <div style="font-size:22px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
  </div>

  <h1 style="text-align:center; font-size:16px; text-transform:uppercase; letter-spacing:1px;">Attestation de suivi</h1>

  <p style="margin-top:20px;">Nous soussignés, <strong>{{cabinetName}}</strong>, attestons que :</p>

  <p style="margin:14px 0; padding:12px; background:#f8fafc; border-left:3px solid #1e3a8a;">
    <strong>{{full_name}}</strong> {{company_name}} (réf. client {{customer_code}}),
    domicilié(e) {{address}}, {{postal_code}} {{country}},
    est suivi(e) par notre cabinet dans le cadre de {{dossiersCount}} dossier(s).
  </p>

  <p>La présente attestation est délivrée pour servir et valoir ce que de droit.</p>

  <p style="margin-top:30px; text-align:right;">Fait le {{generatedAt_fmt}}.</p>
  <p style="text-align:right; margin-top:40px;"><strong>{{cabinetName}}</strong></p>

  <div class="footer">{{cabinetName}} © {{year}}</div>
</div>
`;

/* ════════════════════════════════════════════════════════════════════════
 *  AUDIENCES
 * ════════════════════════════════════════════════════════════════════════ */

const AUDIENCE_VARS = JSON.stringify([
  'cabinetName',
  'audienceDate_fmt',
  'audience_time',
  'room',
  'judge_name',
  'jurisdiction.name',
  'audienceType.name',
  'status_label',
  'dossier.dossier_number',
  'dossier.object',
  'dossier.client_name',
  'decision_text',
  'decision_outcome',
  'decisionDate_fmt',
  'report_content',
  'notes',
  'generatedAt_fmt',
  'year',
]);

const AUDIENCE_FICHE = `
<div style="padding:16px;">
  <div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1e3a8a;">
    <div style="font-size:20px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:16px; font-weight:bold; color:#0f172a;">FICHE D'AUDIENCE</div>
  </div>

  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Date</td><td>{{audienceDate_fmt}} à {{audience_time}}</td></tr>
      <tr><td>Juridiction</td><td>{{jurisdiction.name}}</td></tr>
      <tr><td>Salle</td><td>{{room}}</td></tr>
      <tr><td>Magistrat</td><td>{{judge_name}}</td></tr>
      <tr><td>Type d'audience</td><td>{{audienceType.name}}</td></tr>
      <tr><td>Statut</td><td>{{status_label}}</td></tr>
    </tbody>
  </table>

  <h2>Dossier concerné</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">N° Dossier</td><td>{{dossier.dossier_number}}</td></tr>
      <tr><td>Objet</td><td>{{dossier.object}}</td></tr>
      <tr><td>Client</td><td>{{dossier.client_name}}</td></tr>
    </tbody>
  </table>

  <h2>Notes</h2>
  <p>{{notes}}</p>

  <div class="footer">Fiche générée le {{generatedAt_fmt}} — {{cabinetName}} © {{year}}</div>
</div>
`;

const AUDIENCE_PV = `
<div style="padding:16px;">
  <div style="border-bottom:2px solid #b45309; padding-bottom:8px; margin-bottom:14px;">
    <div style="font-size:18px; font-weight:bold; color:#b45309;">COMPTE-RENDU D'AUDIENCE</div>
    <div style="font-size:11px; color:#475569;">{{cabinetName}}</div>
  </div>

  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Date d'audience</td><td>{{audienceDate_fmt}} à {{audience_time}}</td></tr>
      <tr><td>Juridiction</td><td>{{jurisdiction.name}} — Salle {{room}}</td></tr>
      <tr><td>Magistrat</td><td>{{judge_name}}</td></tr>
      <tr><td>Dossier</td><td>{{dossier.dossier_number}} — {{dossier.object}}</td></tr>
    </tbody>
  </table>

  <h2>Déroulé de l'audience</h2>
  <p>{{report_content}}</p>

  <h2>Décision</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Issue</td><td>{{decision_outcome}}</td></tr>
      <tr><td>Date de décision</td><td>{{decisionDate_fmt}}</td></tr>
    </tbody>
  </table>
  <p>{{decision_text}}</p>

  <div class="footer">Compte-rendu généré le {{generatedAt_fmt}} — Usage interne — {{cabinetName}}</div>
</div>
`;

/* ════════════════════════════════════════════════════════════════════════
 *  DILIGENCES
 * ════════════════════════════════════════════════════════════════════════ */

const DILIGENCE_VARS = JSON.stringify([
  'cabinetName',
  'title',
  'description',
  'status_label',
  'priority_label',
  'startDate_fmt',
  'deadline_fmt',
  'completionDate_fmt',
  'budget_hours',
  'actual_hours',
  'client_reference',
  'assignedLawyer.full_name',
  'dossier.dossier_number',
  'dossier.object',
  'findings_summary',
  'recommendations',
  'generatedAt_fmt',
  'year',
]);

const DILIGENCE_ORDRE = `
<div style="padding:16px;">
  <div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1e3a8a;">
    <div style="font-size:20px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
    <div style="font-size:16px; font-weight:bold; color:#0f172a;">ORDRE DE MISSION</div>
  </div>

  <h2>{{title}}</h2>
  <p>{{description}}</p>

  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Dossier rattaché</td><td>{{dossier.dossier_number}} — {{dossier.object}}</td></tr>
      <tr><td>Intervenant</td><td>{{assignedLawyer.full_name}}</td></tr>
      <tr><td>Référence client</td><td>{{client_reference}}</td></tr>
      <tr><td>Priorité</td><td>{{priority_label}}</td></tr>
      <tr><td>Date de début</td><td>{{startDate_fmt}}</td></tr>
      <tr><td>Échéance</td><td>{{deadline_fmt}}</td></tr>
      <tr><td>Budget (heures)</td><td>{{budget_hours}}</td></tr>
    </tbody>
  </table>

  <div class="footer">Ordre de mission généré le {{generatedAt_fmt}} — {{cabinetName}} © {{year}}</div>
</div>
`;

const DILIGENCE_RAPPORT = `
<div style="padding:16px;">
  <div style="border-bottom:2px solid #0f766e; padding-bottom:8px; margin-bottom:14px;">
    <div style="font-size:18px; font-weight:bold; color:#0f766e;">RAPPORT DE DILIGENCE</div>
    <div style="font-size:11px; color:#475569;">{{cabinetName}}</div>
  </div>

  <h2>{{title}}</h2>
  <table style="width:100%;">
    <tbody>
      <tr><td style="width:40%;">Dossier</td><td>{{dossier.dossier_number}} — {{dossier.object}}</td></tr>
      <tr><td>Intervenant</td><td>{{assignedLawyer.full_name}}</td></tr>
      <tr><td>Statut</td><td>{{status_label}}</td></tr>
      <tr><td>Réalisé le</td><td>{{completionDate_fmt}}</td></tr>
      <tr><td>Temps passé / budget</td><td>{{actual_hours}} h / {{budget_hours}} h</td></tr>
    </tbody>
  </table>

  <h2>Constatations</h2>
  <p>{{findings_summary}}</p>

  <h2>Recommandations</h2>
  <p>{{recommendations}}</p>

  <div class="footer">Rapport généré le {{generatedAt_fmt}} — Usage interne — {{cabinetName}}</div>
</div>
`;

/* ════════════════════════════════════════════════════════════════════════
 *  GÉNÉRAL (courrier type)
 * ════════════════════════════════════════════════════════════════════════ */

const GENERAL_VARS = JSON.stringify([
  'cabinetName',
  'cabinetAddress',
  'date_fmt',
  'recipientName',
  'recipientAddress',
  'subject',
  'bodyContent',
  'signatoryName',
  'signatoryTitle',
  'generatedAt_fmt',
  'year',
]);

const GENERAL_COURRIER = `
<div style="padding:24px;">
  <table style="width:100%; margin-bottom:24px; border:none;">
    <tr>
      <td style="border:none; vertical-align:top;">
        <div style="font-size:18px; font-weight:bold; color:#1e3a8a;">{{cabinetName}}</div>
        <div style="font-size:10px; color:#64748b;">{{cabinetAddress}}</div>
      </td>
      <td style="border:none; vertical-align:top; text-align:right; font-size:10px; color:#475569;">
        <div>{{recipientName}}</div>
        <div>{{recipientAddress}}</div>
      </td>
    </tr>
  </table>

  <p style="text-align:right;">Le {{date_fmt}}</p>

  <p style="margin-top:16px;"><strong>Objet : {{subject}}</strong></p>

  <div style="margin-top:16px; line-height:1.6;">{{bodyContent}}</div>

  <p style="margin-top:30px;">Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.</p>

  <div style="margin-top:40px; text-align:right;">
    <div style="font-weight:bold;">{{signatoryName}}</div>
    <div style="font-size:10px; color:#64748b;">{{signatoryTitle}}</div>
  </div>

  <div class="footer">{{cabinetName}} © {{year}} — {{generatedAt_fmt}}</div>
</div>
`;

export default class PdfTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(PdfTemplate);

    const templates: Partial<PdfTemplate>[] = [
      // ── FACTURES ──────────────────────────────────────────────
      {
        code: 'facture_standard',
        name: 'Facture — Standard',
        entity_type: 'facture',
        variant: 'standard',
        description:
          'Facture complète remise au client (montants, paiements, solde).',
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
        description:
          'Version destinée à la comptabilité : ventilation fiscale HT/TVA/TTC et règlements.',
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

      // ── DOSSIERS ──────────────────────────────────────────────
      {
        code: 'dossier_standard',
        name: 'Dossier — Fiche complète',
        entity_type: 'dossier',
        variant: 'standard',
        description:
          'Fiche détaillée du dossier : parties, procédure, juridiction, finances et étapes.',
        title: 'FICHE DOSSIER',
        body_html: DOSSIER_STANDARD,
        variables: DOSSIER_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'dossier_synthese',
        name: 'Dossier — Synthèse interne',
        entity_type: 'dossier',
        variant: 'interne',
        description:
          'Synthèse interne avec récapitulatif des audiences, diligences et décision.',
        title: 'SYNTHÈSE DE DOSSIER',
        body_html: DOSSIER_SYNTHESE,
        variables: DOSSIER_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'dossier_client',
        name: 'Dossier — Point client',
        entity_type: 'dossier',
        variant: 'client',
        description: "Note d'avancement adressée au client.",
        title: 'POINT SUR VOTRE DOSSIER',
        body_html: DOSSIER_CLIENT,
        variables: DOSSIER_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },

      // ── CLIENTS ───────────────────────────────────────────────
      {
        code: 'client_fiche',
        name: 'Client — Fiche signalétique',
        entity_type: 'client',
        variant: 'standard',
        description:
          'Fiche client : identité, contact, informations légales et activité.',
        title: 'FICHE CLIENT',
        body_html: CLIENT_FICHE,
        variables: CLIENT_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'client_attestation',
        name: 'Client — Attestation de suivi',
        entity_type: 'client',
        variant: 'interne',
        description: 'Attestation de suivi du client par le cabinet.',
        title: 'ATTESTATION DE SUIVI',
        body_html: CLIENT_ATTESTATION,
        variables: CLIENT_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },

      // ── AUDIENCES ─────────────────────────────────────────────
      {
        code: 'audience_fiche',
        name: 'Audience — Fiche',
        entity_type: 'audience',
        variant: 'standard',
        description:
          "Fiche d'audience : date, juridiction, magistrat et dossier concerné.",
        title: "FICHE D'AUDIENCE",
        body_html: AUDIENCE_FICHE,
        variables: AUDIENCE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'audience_pv',
        name: 'Audience — Compte-rendu',
        entity_type: 'audience',
        variant: 'interne',
        description: "Compte-rendu d'audience avec déroulé et décision.",
        title: "COMPTE-RENDU D'AUDIENCE",
        body_html: AUDIENCE_PV,
        variables: AUDIENCE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },

      // ── DILIGENCES ────────────────────────────────────────────
      {
        code: 'diligence_ordre',
        name: 'Diligence — Ordre de mission',
        entity_type: 'diligence',
        variant: 'standard',
        description: "Ordre de mission décrivant la diligence à réaliser.",
        title: 'ORDRE DE MISSION',
        body_html: DILIGENCE_ORDRE,
        variables: DILIGENCE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },
      {
        code: 'diligence_rapport',
        name: 'Diligence — Rapport',
        entity_type: 'diligence',
        variant: 'interne',
        description:
          'Rapport de diligence : constatations et recommandations.',
        title: 'RAPPORT DE DILIGENCE',
        body_html: DILIGENCE_RAPPORT,
        variables: DILIGENCE_VARS,
        orientation: 'portrait',
        paper_size: 'a4',
        is_system: true,
        is_active: true,
      },

      // ── GÉNÉRAL ───────────────────────────────────────────────
      {
        code: 'general_courrier',
        name: 'Général — Courrier type',
        entity_type: 'general',
        variant: 'standard',
        description:
          'Courrier à en-tête du cabinet, corps et objet personnalisables.',
        title: 'COURRIER',
        body_html: GENERAL_COURRIER,
        variables: GENERAL_VARS,
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
