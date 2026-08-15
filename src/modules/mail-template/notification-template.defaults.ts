import { MailTemplate, MailTemplateAudience, MailTemplateCategory } from './entities/mail-template.entity';

export type NotificationTemplateAudience = 'client' | 'employee';

type NotificationTemplateKind =
  | 'dossier'
  | 'audience'
  | 'billing'
  | 'payment'
  | 'diligence'
  | 'document';

type NotificationTemplateConfig = {
  code: string;
  label: string;
  category: MailTemplateCategory;
  kind: NotificationTemplateKind;
  clientSubject: string;
  employeeSubject: string;
  clientIntro: string;
  employeeIntro: string;
  actionLabel: string;
};

const COMMON_VARIABLES = [
  'link',
  'brandColor',
  'cabinet.nom',
  'cabinet.email',
  'cabinet.telephone',
  'date.aujourdhui',
];

const DOSSIER_VARIABLES = [
  'dossier.numero',
  'dossier.objet',
  'dossier.description',
  'dossier.statut',
  'dossier.etape',
  'dossier.date_ouverture',
  'dossier.juridiction',
  'dossier.partie_adverse',
  'dossier.avocat',
  'client.nom',
  'client.email',
  'client.telephone',
];

const AUDIENCE_VARIABLES = [
  ...DOSSIER_VARIABLES,
  'audience.date',
  'audience.heure',
  'audience.juridiction',
  'audience.salle',
  'audience.juge',
  'audience.type',
  'audience.statut',
  'audience.notes',
];

const FACTURE_VARIABLES = [
  ...DOSSIER_VARIABLES,
  'facture.numero',
  'facture.date',
  'facture.echeance',
  'facture.montant_ttc',
  'facture.montant_paye',
  'facture.reste_a_payer',
  'facture.statut',
  'facture.type',
];

const PAIEMENT_VARIABLES = [
  ...FACTURE_VARIABLES,
  'paiement.reference',
  'paiement.montant',
  'paiement.date',
  'paiement.mode',
  'paiement.statut',
];

const DILIGENCE_VARIABLES = [
  ...DOSSIER_VARIABLES,
  'diligence.titre',
  'diligence.description',
  'diligence.type',
  'diligence.statut',
  'diligence.priorite',
  'diligence.date_debut',
  'diligence.date_limite',
  'diligence.avocat',
];

const DOCUMENT_VARIABLES = [
  ...DOSSIER_VARIABLES,
  'document.nom',
  'document.type',
  'document.statut',
  'document.date',
];

const NOTIFICATION_TEMPLATE_CONFIGS: NotificationTemplateConfig[] = [
  {
    code: 'dossier_created',
    label: 'Dossier cree',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Ouverture du dossier {{dossier.numero}}',
    employeeSubject: 'Nouveau dossier {{dossier.numero}}',
    clientIntro: 'Votre dossier est maintenant ouvert. Les informations principales sont reprises ci-dessous pour faciliter le suivi.',
    employeeIntro: 'Un dossier vient d etre cree. Verifiez les affectations, les pieces initiales et les prochaines actions.',
    actionLabel: 'Ouvrir le dossier',
  },
  {
    code: 'dossier_updated',
    label: 'Dossier mis a jour',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Mise a jour du dossier {{dossier.numero}}',
    employeeSubject: 'Dossier {{dossier.numero}} mis a jour',
    clientIntro: 'Une information de votre dossier a ete mise a jour par le cabinet.',
    employeeIntro: 'Un dossier suivi par le cabinet a ete modifie. Controlez les impacts sur les actions en cours.',
    actionLabel: 'Consulter le dossier',
  },
  {
    code: 'dossier_status_changed',
    label: 'Statut dossier modifie',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Avancement du dossier {{dossier.numero}}',
    employeeSubject: 'Changement de statut - dossier {{dossier.numero}}',
    clientIntro: 'Le statut de votre dossier a evolue. Le statut actuel est indique dans le recapitulatif.',
    employeeIntro: 'Le statut d un dossier a change. Verifiez les prochaines etapes et les delais associes.',
    actionLabel: 'Voir le statut',
  },
  {
    code: 'dossier_closed',
    label: 'Dossier cloture',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Cloture du dossier {{dossier.numero}}',
    employeeSubject: 'Dossier {{dossier.numero}} cloture',
    clientIntro: 'Votre dossier est indique comme cloture. Le recapitulatif ci-dessous reprend les informations de reference.',
    employeeIntro: 'Un dossier vient d etre cloture. Controlez les pieces finales, la facturation et l archivage.',
    actionLabel: 'Voir le dossier',
  },
  {
    code: 'collaborator_added',
    label: 'Collaborateur ajoute',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Equipe chargee du dossier {{dossier.numero}}',
    employeeSubject: 'Nouvelle affectation - dossier {{dossier.numero}}',
    clientIntro: 'L equipe chargee de votre dossier a ete mise a jour.',
    employeeIntro: 'Vous ou un collaborateur avez ete ajoute au suivi du dossier. Prenez connaissance du contexte.',
    actionLabel: 'Ouvrir le dossier',
  },
  {
    code: 'collaborator_removed',
    label: 'Collaborateur retire',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Mise a jour de l equipe - dossier {{dossier.numero}}',
    employeeSubject: 'Affectation modifiee - dossier {{dossier.numero}}',
    clientIntro: 'La composition de l equipe chargee de votre dossier a ete mise a jour.',
    employeeIntro: 'Un collaborateur a ete retire du suivi du dossier. Verifiez la repartition des taches restantes.',
    actionLabel: 'Voir les affectations',
  },
  {
    code: 'audience_created',
    label: 'Audience creee',
    category: 'audience',
    kind: 'audience',
    clientSubject: 'Audience du {{audience.date}} - dossier {{dossier.numero}}',
    employeeSubject: 'Nouvelle audience {{audience.date}} - dossier {{dossier.numero}}',
    clientIntro: 'Une audience a ete planifiee dans votre dossier. Merci de prendre connaissance des informations pratiques.',
    employeeIntro: 'Une audience vient d etre ajoutee. Controlez la juridiction, l heure et la preparation requise.',
    actionLabel: 'Voir l audience',
  },
  {
    code: 'audience_updated',
    label: 'Audience modifiee',
    category: 'audience',
    kind: 'audience',
    clientSubject: 'Modification audience {{audience.date}} - dossier {{dossier.numero}}',
    employeeSubject: 'Audience modifiee - dossier {{dossier.numero}}',
    clientIntro: 'Les informations d une audience de votre dossier ont ete modifiees.',
    employeeIntro: 'Une audience a ete modifiee. Verifiez si les parties et les pieces doivent etre mises a jour.',
    actionLabel: 'Voir l audience',
  },
  {
    code: 'audience_reminder',
    label: 'Rappel audience',
    category: 'audience',
    kind: 'audience',
    clientSubject: 'Rappel audience {{audience.date}} - dossier {{dossier.numero}}',
    employeeSubject: 'Rappel audience {{audience.date}} - dossier {{dossier.numero}}',
    clientIntro: 'Nous vous rappelons l audience prevue dans votre dossier.',
    employeeIntro: 'Une audience approche. Controlez les pieces, consignes et responsabilites.',
    actionLabel: 'Ouvrir l audience',
  },
  {
    code: 'audience_held',
    label: 'Audience tenue',
    category: 'audience',
    kind: 'audience',
    clientSubject: 'Audience tenue - dossier {{dossier.numero}}',
    employeeSubject: 'Audience tenue - dossier {{dossier.numero}}',
    clientIntro: 'Une audience liee a votre dossier a ete marquee comme tenue.',
    employeeIntro: 'Une audience a ete marquee comme tenue. Completez le compte rendu et les suites a donner.',
    actionLabel: 'Voir le compte rendu',
  },
  {
    code: 'audience_cancelled',
    label: 'Audience annulee',
    category: 'audience',
    kind: 'audience',
    clientSubject: 'Audience annulee - dossier {{dossier.numero}}',
    employeeSubject: 'Audience annulee - dossier {{dossier.numero}}',
    clientIntro: 'Une audience liee a votre dossier a ete annulee. Les informations disponibles sont reprises ci-dessous.',
    employeeIntro: 'Une audience a ete annulee. Verifiez les impacts sur le dossier, les pieces et les prochaines actions.',
    actionLabel: 'Voir l audience',
  },
  {
    code: 'facture_created',
    label: 'Facture creee',
    category: 'billing',
    kind: 'billing',
    clientSubject: 'Facture {{facture.numero}} - {{cabinet.nom}}',
    employeeSubject: 'Facture {{facture.numero}} creee',
    clientIntro: 'Une nouvelle facture est disponible pour votre dossier.',
    employeeIntro: 'Une facture vient d etre creee. Verifiez le montant, l echeance et le dossier rattache.',
    actionLabel: 'Voir la facture',
  },
  {
    code: 'invoice_issued',
    label: 'Facture emise',
    category: 'billing',
    kind: 'billing',
    clientSubject: 'Facture emise {{facture.numero}}',
    employeeSubject: 'Facture emise {{facture.numero}}',
    clientIntro: 'Une facture a ete emise et mise a disposition.',
    employeeIntro: 'Une facture a ete emise. Suivez son envoi et son reglement.',
    actionLabel: 'Voir la facture',
  },
  {
    code: 'facture_paid',
    label: 'Facture payee',
    category: 'billing',
    kind: 'billing',
    clientSubject: 'Paiement confirme - facture {{facture.numero}}',
    employeeSubject: 'Facture {{facture.numero}} reglee',
    clientIntro: 'Le reglement de votre facture a ete confirme.',
    employeeIntro: 'Une facture est marquee comme payee. Controlez le rapprochement comptable si necessaire.',
    actionLabel: 'Voir la facture',
  },
  {
    code: 'facture_overdue',
    label: 'Facture en retard',
    category: 'billing',
    kind: 'billing',
    clientSubject: 'Facture {{facture.numero}} en attente de reglement',
    employeeSubject: 'Facture {{facture.numero}} en retard',
    clientIntro: 'Une facture reste en attente de reglement. Les informations utiles sont reprises ci-dessous.',
    employeeIntro: 'Une facture est en retard. Verifiez le dossier et les actions de relance.',
    actionLabel: 'Voir la facture',
  },
  {
    code: 'paiement_received',
    label: 'Paiement recu',
    category: 'billing',
    kind: 'payment',
    clientSubject: 'Paiement enregistre - facture {{facture.numero}}',
    employeeSubject: 'Paiement recu - facture {{facture.numero}}',
    clientIntro: 'Votre paiement a ete enregistre par le cabinet.',
    employeeIntro: 'Un paiement vient d etre enregistre. Controlez le rapprochement avec la facture.',
    actionLabel: 'Voir le paiement',
  },
  {
    code: 'document_uploaded',
    label: 'Document ajoute',
    category: 'dossier',
    kind: 'document',
    clientSubject: 'Document disponible - {{document.nom}}',
    employeeSubject: 'Document ajoute - dossier {{dossier.numero}}',
    clientIntro: 'Un document a ete ajoute a votre espace ou a votre dossier.',
    employeeIntro: 'Un document a ete ajoute. Verifiez son classement et son acces.',
    actionLabel: 'Voir le document',
  },
  {
    code: 'document_shared',
    label: 'Document partage',
    category: 'dossier',
    kind: 'document',
    clientSubject: 'Document partage - {{document.nom}}',
    employeeSubject: 'Document partage - dossier {{dossier.numero}}',
    clientIntro: 'Un document vient d etre partage avec vous.',
    employeeIntro: 'Un document a ete partage. Controlez les destinataires et les droits d acces.',
    actionLabel: 'Ouvrir le document',
  },
  {
    code: 'diligence_assigned',
    label: 'Diligence assignee',
    category: 'dossier',
    kind: 'diligence',
    clientSubject: 'Action ouverte - dossier {{dossier.numero}}',
    employeeSubject: 'Diligence {{diligence.titre}} - dossier {{dossier.numero}}',
    clientIntro: 'Une diligence a ete ouverte dans le cadre de votre dossier.',
    employeeIntro: 'Une diligence vous concerne. Consultez le delai, la priorite et les consignes.',
    actionLabel: 'Voir la diligence',
  },
  {
    code: 'diligence_completed',
    label: 'Diligence terminee',
    category: 'dossier',
    kind: 'diligence',
    clientSubject: 'Action terminee - dossier {{dossier.numero}}',
    employeeSubject: 'Diligence terminee - {{diligence.titre}}',
    clientIntro: 'Une diligence liee a votre dossier a ete marquee comme terminee.',
    employeeIntro: 'Une diligence est terminee. Verifiez les suites a donner au dossier.',
    actionLabel: 'Voir la diligence',
  },
  {
    code: 'procedure_stage_changed',
    label: 'Etape de procedure modifiee',
    category: 'dossier',
    kind: 'dossier',
    clientSubject: 'Nouvelle etape - dossier {{dossier.numero}}',
    employeeSubject: 'Etape modifiee - dossier {{dossier.numero}}',
    clientIntro: 'Votre dossier a avance vers une nouvelle etape de procedure.',
    employeeIntro: 'Une etape de procedure a change. Verifiez les prochaines actions et echeances.',
    actionLabel: 'Voir la procedure',
  },
];

export function buildNotificationTemplates(): Partial<MailTemplate>[] {
  return NOTIFICATION_TEMPLATE_CONFIGS.flatMap((config) => [
    buildNotificationTemplate(config, 'client'),
    buildNotificationTemplate(config, 'employee'),
  ]);
}

export function buildNotificationTemplateByCode(
  code: string,
): Partial<MailTemplate> | null {
  const match = code.match(/^(.*)_(client|employee)$/);
  if (!match) return null;

  const [, baseCode, audience] = match;
  const config = NOTIFICATION_TEMPLATE_CONFIGS.find((item) => item.code === baseCode);
  if (!config) return null;

  return buildNotificationTemplate(config, audience as NotificationTemplateAudience);
}

function buildNotificationTemplate(
  config: NotificationTemplateConfig,
  recipient: NotificationTemplateAudience,
): Partial<MailTemplate> {
  const isClient = recipient === 'client';
  const audience: MailTemplateAudience = isClient ? 'client' : 'collaborator';
  const nameAudience = isClient ? 'client' : 'equipe';

  return {
    code: `${config.code}_${recipient}`,
    name: `${config.label} - ${isClient ? 'client' : 'equipe interne'}`,
    category: config.category,
    audience,
    description: `Modele systeme modifiable pour les notifications ${nameAudience}.`,
    subject: isClient ? config.clientSubject : `[Interne] ${config.employeeSubject}`,
    body_html: isClient ? buildClientNotificationBody(config) : buildEmployeeNotificationBody(config),
    variables: JSON.stringify(variablesFor(config.kind)),
    is_system: true,
    is_active: true,
  };
}

function variablesFor(kind: NotificationTemplateKind): string[] {
  const specific = {
    dossier: DOSSIER_VARIABLES,
    audience: AUDIENCE_VARIABLES,
    billing: FACTURE_VARIABLES,
    payment: PAIEMENT_VARIABLES,
    diligence: DILIGENCE_VARIABLES,
    document: DOCUMENT_VARIABLES,
  }[kind];

  return [...new Set([...COMMON_VARIABLES, ...specific])];
}

function buildClientNotificationBody(config: NotificationTemplateConfig): string {
  return `
<h2 style="margin:0 0 12px;color:#111827;">${config.clientSubject}</h2>
<p>Bonjour{{#if client.nom}} {{client.nom}}{{/if}},</p>
<p>${config.clientIntro}</p>
${detailsTable(config.kind)}
{{#if link}}
<p style="text-align:center;margin:22px 0;">
  <a href="{{link}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:5px;font-weight:600;display:inline-block;">${config.actionLabel}</a>
</p>
{{/if}}
<p style="color:#4b5563;">Pour toute precision, vous pouvez contacter le cabinet.</p>
<p>Cordialement,<br/><strong>{{cabinet.nom}}</strong></p>`;
}

function buildEmployeeNotificationBody(config: NotificationTemplateConfig): string {
  return `
<h2 style="margin:0 0 12px;color:#111827;">${config.employeeSubject}</h2>
<p>${config.employeeIntro}</p>
${detailsTable(config.kind)}
{{#if link}}
<p style="text-align:center;margin:22px 0;">
  <a href="{{link}}" style="background:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:5px;font-weight:600;display:inline-block;">${config.actionLabel}</a>
</p>
{{/if}}
<p style="color:#6b7280;font-size:12px;margin-top:18px;">Notification interne envoyee automatiquement par {{cabinet.nom}} le {{date.aujourdhui}}.</p>`;
}

function detailsTable(kind: NotificationTemplateKind): string {
  return `
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
${rowsFor(kind).join('\n')}
</table>`;
}

function rowsFor(kind: NotificationTemplateKind): string[] {
  const commonRows = [
    row('Dossier', 'dossier.numero'),
    row('Objet', 'dossier.objet'),
    row('Client', 'client.nom'),
    row('Statut dossier', 'dossier.statut'),
    row('Etape', 'dossier.etape'),
    row('Juridiction', 'dossier.juridiction'),
    row('Avocat responsable', 'dossier.avocat'),
  ];

  if (kind === 'audience') {
    return [
      ...commonRows,
      row('Date audience', 'audience.date'),
      row('Heure', 'audience.heure'),
      row('Juridiction audience', 'audience.juridiction'),
      row('Salle', 'audience.salle'),
      row('Juge', 'audience.juge'),
      row('Type', 'audience.type'),
      row('Statut audience', 'audience.statut'),
      row('Notes', 'audience.notes'),
    ];
  }

  if (kind === 'billing') {
    return [
      row('Facture', 'facture.numero'),
      row('Date facture', 'facture.date'),
      row('Echeance', 'facture.echeance'),
      row('Montant TTC', 'facture.montant_ttc'),
      row('Montant paye', 'facture.montant_paye'),
      row('Reste a payer', 'facture.reste_a_payer'),
      row('Statut facture', 'facture.statut'),
      row('Type facture', 'facture.type'),
      ...commonRows,
    ];
  }

  if (kind === 'payment') {
    return [
      row('Reference paiement', 'paiement.reference'),
      row('Montant recu', 'paiement.montant'),
      row('Date paiement', 'paiement.date'),
      row('Mode paiement', 'paiement.mode'),
      row('Statut paiement', 'paiement.statut'),
      row('Facture', 'facture.numero'),
      row('Montant facture', 'facture.montant_ttc'),
      row('Reste a payer', 'facture.reste_a_payer'),
      ...commonRows,
    ];
  }

  if (kind === 'diligence') {
    return [
      row('Diligence', 'diligence.titre'),
      row('Description', 'diligence.description'),
      row('Type', 'diligence.type'),
      row('Priorite', 'diligence.priorite'),
      row('Statut diligence', 'diligence.statut'),
      row('Date debut', 'diligence.date_debut'),
      row('Date limite', 'diligence.date_limite'),
      row('Avocat assigne', 'diligence.avocat'),
      ...commonRows,
    ];
  }

  if (kind === 'document') {
    return [
      row('Document', 'document.nom'),
      row('Type document', 'document.type'),
      row('Statut document', 'document.statut'),
      row('Date document', 'document.date'),
      ...commonRows,
    ];
  }

  return commonRows;
}

function row(label: string, variable: string): string {
  return `{{#if ${variable}}}
  <tr>
    <td style="padding:8px 10px;background:#f3f4f6;font-weight:600;width:38%;">${label}</td>
    <td style="padding:8px 10px;background:#f9fafb;">{{${variable}}}</td>
  </tr>
{{/if}}`;
}
