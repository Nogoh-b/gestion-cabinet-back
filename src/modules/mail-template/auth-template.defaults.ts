import { MailTemplate } from './entities/mail-template.entity';

export const AUTH_TEMPLATE_DEFAULTS: Partial<MailTemplate>[] = [
  {
    code: 'account_opening',
    name: 'Ouverture de compte',
    category: 'auth',
    audience: 'both',
    description: "Envoye lorsqu'un compte est ouvert ou qu'un utilisateur doit definir son acces.",
    subject: 'Votre acces {{cabinetName}} est pret',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Bienvenue {{firstName}}</h2>
<p>Un acces a ete cree pour vous sur l'espace <strong>{{cabinetName}}</strong>.</p>
<p>Utilisez le bouton ci-dessous pour vous connecter ou finaliser la creation de votre mot de passe.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="{{loginUrl}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:5px;font-weight:600;display:inline-block;">Acceder a mon espace</a>
</p>
<p style="color:#6b7280;font-size:13px;">Si vous n'attendiez pas cet acces, vous pouvez ignorer ce message ou contacter le cabinet.</p>
<p>Cordialement,<br/><strong>{{cabinetName}}</strong></p>`,
    variables: JSON.stringify(['firstName', 'loginUrl', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'reset_password',
    name: 'Reinitialisation du mot de passe',
    category: 'auth',
    audience: 'both',
    description: "Envoye lorsqu'un utilisateur demande la reinitialisation de son mot de passe.",
    subject: 'Reinitialisation de votre mot de passe',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Reinitialisation du mot de passe</h2>
<p>Bonjour {{firstName}},</p>
<p>Une demande de reinitialisation a ete initiee pour votre compte.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="{{resetUrl}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:5px;font-weight:600;display:inline-block;">Choisir un nouveau mot de passe</a>
</p>
<p style="color:#6b7280;font-size:13px;">Ce lien est temporaire. Si vous n'etes pas a l'origine de cette demande, ignorez cet e-mail.</p>`,
    variables: JSON.stringify(['firstName', 'resetUrl', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'account_activation',
    name: 'Activation de compte',
    category: 'auth',
    audience: 'collaborator',
    description: "Envoye pour activer un compte collaborateur nouvellement cree.",
    subject: 'Activez votre compte {{cabinetName}}',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Activation de compte</h2>
<p>Bonjour {{firstName}},</p>
<p>Votre compte collaborateur a ete cree sur l'espace <strong>{{cabinetName}}</strong>.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="{{activationUrl}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:5px;font-weight:600;display:inline-block;">Activer mon compte</a>
</p>
<p style="color:#6b7280;font-size:13px;">L'activation vous permettra de definir votre mot de passe et d'acceder a votre espace de travail.</p>`,
    variables: JSON.stringify(['firstName', 'activationUrl', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'tenant_welcome',
    name: 'Bienvenue cabinet',
    category: 'auth',
    audience: 'collaborator',
    description: "Envoye a l'administrateur apres la creation d'un cabinet.",
    subject: 'Bienvenue sur {{appName}}, {{cabinetName}}',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Bienvenue {{firstName}}</h2>
<p>Le cabinet <strong>{{cabinetName}}</strong> est maintenant disponible sur {{appName}}.</p>
<p>Votre espace est pret pour configurer le cabinet, inviter l'equipe et commencer le suivi des dossiers.</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
  <tr>
    <td style="padding:8px 10px;background:#f3f4f6;font-weight:600;width:40%;">Code cabinet</td>
    <td style="padding:8px 10px;background:#f9fafb;">{{tenantCode}}</td>
  </tr>
</table>
<p style="text-align:center;margin:28px 0;">
  <a href="{{loginUrl}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:5px;font-weight:600;display:inline-block;">Acceder au cabinet</a>
</p>`,
    variables: JSON.stringify(['firstName', 'cabinetName', 'appName', 'loginUrl', 'tenantCode', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'employee_credentials',
    name: 'Identifiants collaborateur',
    category: 'auth',
    audience: 'collaborator',
    description: "Envoye a un collaborateur avec ses identifiants temporaires.",
    subject: 'Vos identifiants {{cabinetName}}',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Vos identifiants de connexion</h2>
<p>Bonjour {{firstName}},</p>
<p>Un compte vient d'etre cree pour vous sur l'espace <strong>{{cabinetName}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
  <tr>
    <td style="padding:8px 10px;background:#f3f4f6;font-weight:600;width:40%;">Identifiant</td>
    <td style="padding:8px 10px;background:#f9fafb;">{{email}}</td>
  </tr>
  <tr>
    <td style="padding:8px 10px;background:#f3f4f6;font-weight:600;">Mot de passe temporaire</td>
    <td style="padding:8px 10px;background:#f9fafb;font-weight:700;">{{tempPassword}}</td>
  </tr>
</table>
<p style="text-align:center;margin:28px 0;">
  <a href="{{loginUrl}}" style="background:{{brandColor}};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:5px;font-weight:600;display:inline-block;">Me connecter</a>
</p>
<p style="color:#b91c1c;font-size:13px;">Modifiez ce mot de passe des votre premiere connexion.</p>`,
    variables: JSON.stringify(['firstName', 'email', 'tempPassword', 'loginUrl', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'otp_code',
    name: 'Code de verification',
    category: 'auth',
    audience: 'both',
    description: "Envoye pour transmettre un code de verification a usage unique.",
    subject: 'Votre code de verification',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Code de verification</h2>
<p>Bonjour {{firstName}},</p>
<p>Utilisez le code ci-dessous pour finaliser votre operation.</p>
<p style="text-align:center;margin:24px 0;">
  <span style="font-size:30px;letter-spacing:8px;font-weight:bold;color:{{brandColor}};border:1px dashed {{brandColor}};padding:12px 20px;border-radius:8px;display:inline-block;">{{otpCode}}</span>
</p>
<p style="color:#6b7280;font-size:13px;">Ce code expire dans {{expiryMinutes}} minutes. Ne le communiquez a personne.</p>`,
    variables: JSON.stringify(['firstName', 'otpCode', 'expiryMinutes', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
  {
    code: 'password_changed',
    name: 'Mot de passe modifie',
    category: 'auth',
    audience: 'both',
    description: "Confirmation envoyee apres un changement de mot de passe reussi.",
    subject: 'Votre mot de passe a ete modifie',
    body_html: `
<h2 style="margin:0 0 12px;color:#111827;">Mot de passe modifie</h2>
<p>Bonjour {{firstName}},</p>
<p>Nous vous confirmons que votre mot de passe a bien ete modifie{{#if changedAt}} le {{changedAt}}{{/if}}.</p>
<p style="color:#b91c1c;font-size:13px;">Si vous n'etes pas a l'origine de cette operation, contactez immediatement {{cabinetName}}.</p>`,
    variables: JSON.stringify(['firstName', 'changedAt', 'cabinetName', 'brandColor']),
    is_system: true,
    is_active: true,
  },
];

export function buildAuthTemplateByCode(code: string): Partial<MailTemplate> | null {
  return AUTH_TEMPLATE_DEFAULTS.find((template) => template.code === code) ?? null;
}
