import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { MailTemplate } from '../entities/mail-template.entity';
import { findOneForTenant } from 'src/core/tenant/seeder-helper';

/**
 * Templates conçus pour le **composer manuel** (CommunicationTab).
 * Contrairement aux templates de notification système (flat title/content/link),
 * ces templates utilisent les variables namespacées :
 *   {{dossier.numero}}, {{client.nom}}, {{facture.montant_ttc}}, etc.
 *
 * Ils sont résolubles automatiquement depuis les données de l'entité sélectionnée
 * dans le ResourcePanel, sans saisie manuelle.
 *
 * is_system: false → l'utilisateur peut les modifier / supprimer.
 */
export default class MailComposerTemplateSeeder implements Seeder {
  public async run(dataSource: DataSource, _fm: SeederFactoryManager): Promise<any> {
    const repo = dataSource.getRepository(MailTemplate);

    const templates: Partial<MailTemplate>[] = [

      // ── DOSSIER — disponibles par défaut (sans sous-ressource) ─────────────

      {
        code: 'composer_dossier_suivi',
        name: '📁 Suivi de dossier',
        category: 'dossier',
        description: 'Message de suivi général adressé au client sur l\'avancement de son dossier.',
        subject: 'Dossier {{dossier.numero}} — Point de situation',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Suivi de votre dossier</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Nous vous contactons afin de vous informer de l'avancement de votre dossier.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;width:40%;">Numéro de dossier</td>
    <td style="padding:8px 12px;">{{dossier.numero}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Objet</td>
    <td style="padding:8px 12px;">{{dossier.objet}}</td>
  </tr>
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;">Statut actuel</td>
    <td style="padding:8px 12px;">{{dossier.statut}}</td>
  </tr>
  {{#if dossier.etape}}
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Étape en cours</td>
    <td style="padding:8px 12px;">{{dossier.etape}}</td>
  </tr>
  {{/if}}
  {{#if dossier.prochaine_audience}}
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;">Prochaine audience</td>
    <td style="padding:8px 12px;">{{dossier.prochaine_audience}}</td>
  </tr>
  {{/if}}
</table>

<p>N'hésitez pas à nous contacter pour tout renseignement complémentaire.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'dossier.numero', 'dossier.objet', 'dossier.statut', 'dossier.etape',
          'dossier.prochaine_audience', 'client.nom', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_dossier_etape',
        name: '🔄 Changement d\'étape',
        category: 'dossier',
        description: 'Informe le client d\'un changement d\'étape ou de statut dans son dossier.',
        subject: 'Mise à jour — Dossier {{dossier.numero}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Mise à jour de votre dossier</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Votre dossier <strong>{{dossier.numero}}</strong> vient d'évoluer.</p>

<div style="background:#eff6ff;border-left:4px solid {{brandColor}};padding:12px 16px;border-radius:4px;margin:16px 0;">
  <p style="margin:0;font-size:13px;">
    <strong>Statut :</strong> {{dossier.statut}}<br/>
    {{#if dossier.etape}}<strong>Étape :</strong> {{dossier.etape}}<br/>{{/if}}
    {{#if dossier.partie_adverse}}<strong>Partie adverse :</strong> {{dossier.partie_adverse}}{{/if}}
  </p>
</div>

{{#if dossier.prochaine_audience}}
<p>Votre prochaine audience est fixée au <strong>{{dossier.prochaine_audience}}</strong>.</p>
{{/if}}

<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'dossier.numero', 'dossier.statut', 'dossier.etape', 'dossier.partie_adverse',
          'dossier.prochaine_audience', 'client.nom', 'cabinet.nom', 'brandColor',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── BILLING — affiché quand une facture est sélectionnée ───────────────

      {
        code: 'composer_facture_emission',
        name: '🧾 Envoi de facture',
        category: 'billing',
        description: 'Transmet une facture au client avec les détails de paiement.',
        subject: 'Facture {{facture.numero}} — {{cabinet.nom}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Votre facture</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Veuillez trouver ci-après les détails de votre facture relative au dossier
   <strong>{{dossier.numero}}</strong>.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;width:45%;">Numéro de facture</td>
    <td style="padding:8px 12px;">{{facture.numero}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Date</td>
    <td style="padding:8px 12px;">{{facture.date}}</td>
  </tr>
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;">Échéance</td>
    <td style="padding:8px 12px;">{{facture.echeance}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Montant TTC</td>
    <td style="padding:8px 12px;font-size:15px;font-weight:700;color:#1f2937;">{{facture.montant_ttc}}</td>
  </tr>
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;">Type</td>
    <td style="padding:8px 12px;">{{facture.type}}</td>
  </tr>
</table>

<p>Pour tout renseignement, contactez-nous à <a href="mailto:{{cabinet.email}}">{{cabinet.email}}</a>.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'facture.numero', 'facture.date', 'facture.echeance', 'facture.montant_ttc',
          'facture.type', 'client.nom', 'dossier.numero', 'cabinet.nom', 'cabinet.email',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_facture_relance',
        name: '⚠️ Relance paiement',
        category: 'billing',
        description: 'Relance un client pour une facture impayée ou partiellement réglée.',
        subject: 'Relance — Facture {{facture.numero}} en attente de règlement',
        body_html: `
<h2 style="margin-top:0;color:#dc2626;">Relance de paiement</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Sauf erreur ou omission de notre part, la facture ci-dessous reste en attente de règlement.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#fef2f2;">
    <td style="padding:8px 12px;font-weight:600;width:45%;">Facture</td>
    <td style="padding:8px 12px;">{{facture.numero}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Montant TTC</td>
    <td style="padding:8px 12px;">{{facture.montant_ttc}}</td>
  </tr>
  {{#if facture.montant_paye}}
  <tr style="background:#fef2f2;">
    <td style="padding:8px 12px;font-weight:600;">Déjà réglé</td>
    <td style="padding:8px 12px;">{{facture.montant_paye}}</td>
  </tr>
  {{/if}}
  <tr style="background:#fef2f2;">
    <td style="padding:8px 12px;font-weight:700;color:#dc2626;">Reste à payer</td>
    <td style="padding:8px 12px;font-weight:700;color:#dc2626;font-size:15px;">{{facture.reste_a_payer}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Échéance</td>
    <td style="padding:8px 12px;">{{facture.echeance}}</td>
  </tr>
</table>

<p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong><br/>
{{#if cabinet.email}}<a href="mailto:{{cabinet.email}}">{{cabinet.email}}</a>{{/if}}
{{#if cabinet.telephone}} · {{cabinet.telephone}}{{/if}}</p>`,
        variables: JSON.stringify([
          'facture.numero', 'facture.montant_ttc', 'facture.montant_paye',
          'facture.reste_a_payer', 'facture.echeance',
          'client.nom', 'cabinet.nom', 'cabinet.email', 'cabinet.telephone',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── AUDIENCE — affiché quand une audience est sélectionnée ─────────────

      {
        code: 'composer_audience_convocation',
        name: '⚖️ Convocation audience',
        category: 'audience',
        description: 'Convoque ou informe le client de la tenue d\'une audience.',
        subject: 'Audience du {{audience.date}} — Dossier {{dossier.numero}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Convocation à une audience</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Nous vous informons qu'une audience est fixée dans votre affaire.</p>

<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:4px;margin:16px 0;">
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr>
      <td style="padding:4px 0;font-weight:600;width:40%;">📅 Date</td>
      <td style="padding:4px 0;font-weight:700;">{{audience.date}}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-weight:600;">🕐 Heure</td>
      <td style="padding:4px 0;">{{audience.heure}}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-weight:600;">🏛️ Juridiction</td>
      <td style="padding:4px 0;">{{audience.juridiction}}</td>
    </tr>
    {{#if audience.salle}}
    <tr>
      <td style="padding:4px 0;font-weight:600;">🚪 Salle</td>
      <td style="padding:4px 0;">{{audience.salle}}</td>
    </tr>
    {{/if}}
    {{#if audience.juge}}
    <tr>
      <td style="padding:4px 0;font-weight:600;">👨‍⚖️ Juge</td>
      <td style="padding:4px 0;">{{audience.juge}}</td>
    </tr>
    {{/if}}
    <tr>
      <td style="padding:4px 0;font-weight:600;">📂 Dossier</td>
      <td style="padding:4px 0;">{{dossier.numero}} — {{dossier.objet}}</td>
    </tr>
  </table>
</div>

{{#if audience.notes}}
<p><strong>Notes :</strong> {{audience.notes}}</p>
{{/if}}

<p>Veuillez vous présenter à l'heure indiquée, muni de votre pièce d'identité.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'audience.date', 'audience.heure', 'audience.juridiction',
          'audience.salle', 'audience.juge', 'audience.notes',
          'client.nom', 'dossier.numero', 'dossier.objet', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_audience_rappel',
        name: '🔔 Rappel audience (veille)',
        category: 'audience',
        description: 'Rappel envoyé la veille ou quelques jours avant une audience.',
        subject: 'Rappel — Audience demain {{audience.date}} à {{audience.heure}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Rappel d'audience</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Nous vous rappelons l'audience prévue dans votre dossier <strong>{{dossier.numero}}</strong>.</p>

<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 8px 0;font-weight:700;font-size:14px;">📅 {{audience.date}} à {{audience.heure}}</p>
  <p style="margin:0;font-size:13px;color:#374151;">
    🏛️ {{audience.juridiction}}
    {{#if audience.salle}} — Salle {{audience.salle}}{{/if}}
  </p>
</div>

<p>Merci de vous présenter <strong>15 minutes avant l'heure</strong> indiquée.</p>
{{#if audience.notes}}<p><em>{{audience.notes}}</em></p>{{/if}}
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'audience.date', 'audience.heure', 'audience.juridiction', 'audience.salle', 'audience.notes',
          'client.nom', 'dossier.numero', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── DOSSIER/DILIGENCE — affiché quand une diligence est sélectionnée ───

      {
        code: 'composer_diligence_notification',
        name: '🔍 Info diligence client',
        category: 'dossier',
        description: 'Informe le client du lancement ou de l\'avancement d\'une diligence.',
        subject: 'Diligence — {{diligence.titre}} (Dossier {{dossier.numero}})',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Information sur une diligence</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Dans le cadre de votre dossier <strong>{{dossier.numero}}</strong>, une diligence a été initiée.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#f5f3ff;">
    <td style="padding:8px 12px;font-weight:600;width:40%;">Titre</td>
    <td style="padding:8px 12px;">{{diligence.titre}}</td>
  </tr>
  {{#if diligence.description}}
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Description</td>
    <td style="padding:8px 12px;">{{diligence.description}}</td>
  </tr>
  {{/if}}
  <tr style="background:#f5f3ff;">
    <td style="padding:8px 12px;font-weight:600;">Type</td>
    <td style="padding:8px 12px;">{{diligence.type}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Statut</td>
    <td style="padding:8px 12px;">{{diligence.statut}}</td>
  </tr>
  <tr style="background:#f5f3ff;">
    <td style="padding:8px 12px;font-weight:600;">Priorité</td>
    <td style="padding:8px 12px;">{{diligence.priorite}}</td>
  </tr>
  {{#if diligence.date_limite}}
  <tr>
    <td style="padding:8px 12px;font-weight:600;color:#dc2626;">Date limite</td>
    <td style="padding:8px 12px;font-weight:700;color:#dc2626;">{{diligence.date_limite}}</td>
  </tr>
  {{/if}}
  {{#if diligence.avocat}}
  <tr style="background:#f5f3ff;">
    <td style="padding:8px 12px;font-weight:600;">Avocat assigné</td>
    <td style="padding:8px 12px;">{{diligence.avocat}}</td>
  </tr>
  {{/if}}
</table>

<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'diligence.titre', 'diligence.description', 'diligence.type',
          'diligence.statut', 'diligence.priorite', 'diligence.date_limite', 'diligence.avocat',
          'client.nom', 'dossier.numero', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── DOSSIER/DOCUMENT — affiché quand un document est sélectionné ────────

      {
        code: 'composer_document_partage',
        name: '📄 Partage de document',
        category: 'dossier',
        description: 'Notifie le client qu\'un document est disponible dans son espace.',
        subject: 'Document disponible — {{document.nom}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Nouveau document disponible</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Un document vous a été partagé dans le cadre de votre dossier
   <strong>{{dossier.numero}}</strong>.</p>

<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 4px;font-size:15px;font-weight:700;">📄 {{document.nom}}</p>
  <p style="margin:0;font-size:12px;color:#6b7280;">
    Type : {{document.type}}
    {{#if document.date}} · {{document.date}}{{/if}}
    {{#if document.statut}} · {{document.statut}}{{/if}}
  </p>
</div>

<p>Vous pouvez le consulter depuis votre espace personnel.
   Pour toute question, contactez-nous à
   <a href="mailto:{{cabinet.email}}">{{cabinet.email}}</a>.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'document.nom', 'document.type', 'document.date', 'document.statut',
          'client.nom', 'dossier.numero', 'cabinet.nom', 'cabinet.email',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── COLLABORATEURS — coordination interne de l'équipe ──────────────────
      // Ces modèles s'adressent aux avocats / secrétaires (audience: collaborator)
      // et sont regroupés à part dans la page de gestion.

      {
        code: 'composer_collab_affectation_dossier',
        name: '👥 Affectation de dossier (interne)',
        category: 'dossier',
        audience: 'collaborator',
        description: 'Informe un collaborateur qu\'un dossier lui est confié.',
        subject: '[Interne] Dossier {{dossier.numero}} vous est confié',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Nouveau dossier à traiter</h2>
<p>Bonjour,</p>
<p>Le dossier suivant vous a été affecté.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;width:40%;">Numéro</td>
    <td style="padding:8px 12px;">{{dossier.numero}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Objet</td>
    <td style="padding:8px 12px;">{{dossier.objet}}</td>
  </tr>
  <tr style="background:#f3f4f6;">
    <td style="padding:8px 12px;font-weight:600;">Client</td>
    <td style="padding:8px 12px;">{{client.nom}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Statut</td>
    <td style="padding:8px 12px;">{{dossier.statut}}</td>
  </tr>
</table>

<p>Merci de prendre connaissance du dossier dès que possible.</p>
<p>— {{cabinet.nom}}</p>`,
        variables: JSON.stringify([
          'dossier.numero', 'dossier.objet', 'dossier.statut', 'client.nom', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_collab_brief_audience',
        name: '⚖️ Brief audience (interne)',
        category: 'audience',
        audience: 'collaborator',
        description: 'Transmet à un collaborateur les informations d\'une audience à couvrir.',
        subject: '[Interne] Audience {{audience.date}} — Dossier {{dossier.numero}}',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Audience à couvrir</h2>
<p>Bonjour,</p>
<p>Merci d'assurer la couverture de l'audience ci-dessous.</p>

<div style="background:#eff6ff;border-left:4px solid {{brandColor}};padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px;">
  <p style="margin:0;">
    <strong>📅 Date :</strong> {{audience.date}} à {{audience.heure}}<br/>
    <strong>🏛️ Juridiction :</strong> {{audience.juridiction}}<br/>
    {{#if audience.salle}}<strong>🚪 Salle :</strong> {{audience.salle}}<br/>{{/if}}
    {{#if audience.juge}}<strong>👨‍⚖️ Juge :</strong> {{audience.juge}}<br/>{{/if}}
    <strong>📂 Dossier :</strong> {{dossier.numero}} — {{dossier.objet}}<br/>
    <strong>👤 Client :</strong> {{client.nom}}
  </p>
</div>

{{#if audience.notes}}<p><strong>Consignes :</strong> {{audience.notes}}</p>{{/if}}
<p>— {{cabinet.nom}}</p>`,
        variables: JSON.stringify([
          'audience.date', 'audience.heure', 'audience.juridiction', 'audience.salle',
          'audience.juge', 'audience.notes', 'dossier.numero', 'dossier.objet',
          'client.nom', 'cabinet.nom', 'brandColor',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_collab_diligence_relance',
        name: '🔔 Relance diligence (interne)',
        category: 'dossier',
        audience: 'collaborator',
        description: 'Relance un collaborateur sur une diligence en attente ou en retard.',
        subject: '[Interne] Diligence à finaliser — {{diligence.titre}}',
        body_html: `
<h2 style="margin-top:0;color:#dc2626;">Diligence en attente</h2>
<p>Bonjour,</p>
<p>La diligence suivante requiert votre attention.</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
  <tr style="background:#fef2f2;">
    <td style="padding:8px 12px;font-weight:600;width:40%;">Titre</td>
    <td style="padding:8px 12px;">{{diligence.titre}}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;font-weight:600;">Dossier</td>
    <td style="padding:8px 12px;">{{dossier.numero}}</td>
  </tr>
  <tr style="background:#fef2f2;">
    <td style="padding:8px 12px;font-weight:600;">Statut</td>
    <td style="padding:8px 12px;">{{diligence.statut}}</td>
  </tr>
  {{#if diligence.date_limite}}
  <tr>
    <td style="padding:8px 12px;font-weight:700;color:#dc2626;">Date limite</td>
    <td style="padding:8px 12px;font-weight:700;color:#dc2626;">{{diligence.date_limite}}</td>
  </tr>
  {{/if}}
</table>

<p>Merci de mettre à jour son avancement dès que possible.</p>
<p>— {{cabinet.nom}}</p>`,
        variables: JSON.stringify([
          'diligence.titre', 'diligence.statut', 'diligence.date_limite',
          'dossier.numero', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      // ── CLIENT — modèles supplémentaires ───────────────────────────────────

      {
        code: 'composer_dossier_cloture',
        name: '✅ Clôture de dossier',
        category: 'dossier',
        audience: 'client',
        description: 'Informe le client de la clôture de son dossier et du résultat obtenu.',
        subject: 'Clôture de votre dossier {{dossier.numero}}',
        body_html: `
<h2 style="margin-top:0;color:#16a34a;">Votre dossier est clôturé</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Nous vous informons que votre dossier <strong>{{dossier.numero}}</strong>
   ({{dossier.objet}}) est désormais clôturé.</p>

{{#if dossier.resultat}}
<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;border-radius:4px;margin:16px 0;">
  <p style="margin:0;font-size:13px;"><strong>Résultat :</strong> {{dossier.resultat}}</p>
</div>
{{/if}}

<p>Nous vous remercions de la confiance que vous nous avez accordée et restons
   à votre disposition pour toute nouvelle demande.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'dossier.numero', 'dossier.objet', 'dossier.resultat', 'client.nom', 'cabinet.nom',
        ]),
        is_system: false,
        is_active: true,
      },

      {
        code: 'composer_rdv_confirmation',
        name: '📅 Confirmation de rendez-vous',
        category: 'general',
        audience: 'client',
        description: 'Confirme au client un rendez-vous au cabinet.',
        subject: 'Confirmation de votre rendez-vous',
        body_html: `
<h2 style="margin-top:0;color:#1f2937;">Rendez-vous confirmé</h2>
<p>Bonjour <strong>{{client.nom}}</strong>,</p>
<p>Nous confirmons votre rendez-vous au sein de notre cabinet.</p>

<div style="background:#eff6ff;border-left:4px solid {{brandColor}};padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px;">
  <p style="margin:0;">
    <strong>📅 Date :</strong> {{rdv.date}}<br/>
    <strong>🕐 Heure :</strong> {{rdv.heure}}<br/>
    {{#if rdv.lieu}}<strong>📍 Lieu :</strong> {{rdv.lieu}}{{/if}}
  </p>
</div>

<p>En cas d'empêchement, merci de nous prévenir à l'avance.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`,
        variables: JSON.stringify([
          'rdv.date', 'rdv.heure', 'rdv.lieu', 'client.nom', 'cabinet.nom', 'brandColor',
        ]),
        is_system: false,
        is_active: true,
      },

    ]; // end templates

    for (const data of templates) {
      // Tous les modèles composer sont destinés au client par défaut.
      if (!data.audience) data.audience = 'client';
      const existing = await findOneForTenant(repo, 'code', data.code);
      if (!existing) {
        await repo.save(repo.create(data));
        console.log(`  ✅ Template composer créé : ${data.code}`);
      } else {
        // Met à jour le corps HTML et les variables si le template existe déjà
        // (utile pour les mises à jour de développement).
        Object.assign(existing, {
          name:      data.name,
          subject:   data.subject,
          body_html: data.body_html,
          variables: data.variables,
          description: data.description,
          audience:  data.audience,
        });
        await repo.save(existing);
        console.log(`  ↩️  Template composer mis à jour : ${data.code}`);
      }
    }
  }
}
