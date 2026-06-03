import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { MailTemplate } from '../entities/mail-template.entity';
import { findOneForTenant } from 'src/core/tenant/seeder-helper';


/**
 * Seed des templates de mail prédéfinis (système).
 * Le header/footer sont ajoutés automatiquement au rendu à partir des
 * informations du cabinet (logo, couleur, coordonnées).
 */
export default class MailTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(MailTemplate);

    const templates: Partial<MailTemplate>[] = [
      {
        code: 'account_opening',
        name: 'Ouverture de compte',
        category: 'auth',
        description: "Envoyé lorsqu'un nouveau compte utilisateur est créé.",
        subject: 'Bienvenue sur {{cabinetName}} !',
        body_html: `
          <h2 style="margin-top:0;">Bonjour {{firstName}},</h2>
          <p>Votre compte a été créé avec succès sur l'espace de <strong>{{cabinetName}}</strong>.</p>
          <p>Vous pouvez dès à présent vous connecter pour accéder à vos dossiers.</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="{{loginUrl}}" style="background:{{brandColor}};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Accéder à mon espace</a>
          </p>
          <p>À très vite,<br/>L'équipe {{cabinetName}}</p>`,
        variables: JSON.stringify(['firstName', 'loginUrl', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'reset_password',
        name: 'Réinitialisation du mot de passe',
        category: 'auth',
        description: "Envoyé lorsqu'un utilisateur demande la réinitialisation de son mot de passe.",
        subject: 'Réinitialisation de votre mot de passe',
        body_html: `
          <h2 style="margin-top:0;">Réinitialisation du mot de passe</h2>
          <p>Bonjour {{firstName}},</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="{{resetUrl}}" style="background:{{brandColor}};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Réinitialiser mon mot de passe</a>
          </p>
          <p style="color:#6b7280;font-size:13px;">Ce lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
        variables: JSON.stringify(['firstName', 'resetUrl', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'account_activation',
        name: 'Activation de compte',
        category: 'auth',
        description: "Envoyé pour activer un compte employé nouvellement créé.",
        subject: 'Activez votre compte {{cabinetName}}',
        body_html: `
          <h2 style="margin-top:0;">Activez votre compte</h2>
          <p>Bonjour {{firstName}},</p>
          <p>Un compte a été créé pour vous sur l'espace de <strong>{{cabinetName}}</strong>. Activez-le pour définir votre mot de passe.</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="{{activationUrl}}" style="background:{{brandColor}};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Activer mon compte</a>
          </p>`,
        variables: JSON.stringify(['firstName', 'activationUrl', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'dossier_created',
        name: 'Nouveau dossier créé',
        category: 'dossier',
        description: "Notification de création d'un dossier.",
        subject: 'Nouveau dossier : {{dossierNumber}}',
        body_html: `
          <h2 style="margin-top:0;">Nouveau dossier ouvert</h2>
          <p>Un nouveau dossier vient d'être créé chez <strong>{{cabinetName}}</strong>.</p>
          <ul>
            <li><strong>Numéro :</strong> {{dossierNumber}}</li>
            <li><strong>Objet :</strong> {{object}}</li>
            <li><strong>Client :</strong> {{clientName}}</li>
          </ul>
          <p>Vous pouvez consulter le dossier depuis votre espace.</p>`,
        variables: JSON.stringify(['dossierNumber', 'object', 'clientName', 'cabinetName']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'audience_reminder',
        name: "Rappel d'audience",
        category: 'audience',
        description: "Rappel automatique avant une audience.",
        subject: "Rappel : audience le {{audienceDate}}",
        body_html: `
          <h2 style="margin-top:0;">Rappel d'audience</h2>
          <p>Bonjour {{firstName}},</p>
          <p>Nous vous rappelons l'audience à venir :</p>
          <ul>
            <li><strong>Date :</strong> {{audienceDate}} à {{audienceTime}}</li>
            <li><strong>Juridiction :</strong> {{jurisdiction}}</li>
            <li><strong>Dossier :</strong> {{dossierNumber}}</li>
          </ul>
          <p>Cordialement,<br/>{{cabinetName}}</p>`,
        variables: JSON.stringify(['firstName', 'audienceDate', 'audienceTime', 'jurisdiction', 'dossierNumber', 'cabinetName']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'invoice_issued',
        name: 'Facture émise',
        category: 'billing',
        description: "Envoyé lors de l'émission d'une facture.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Nouvelle facture</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la facture</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      // ── Templates de notification métier (utilisés par NotificationDispatcher) ──
      {
        code: 'diligence_assigned',
        name: 'Diligence assignée',
        category: 'dossier',
        description: "Envoyé lorsqu'une diligence est assignée à un avocat.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Nouvelle diligence</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la diligence</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'diligence_completed',
        name: 'Diligence terminée',
        category: 'dossier',
        description: "Envoyé lorsqu'une diligence est marquée comme terminée.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Diligence terminée</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la diligence</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'dossier_status_changed',
        name: 'Changement de statut dossier',
        category: 'dossier',
        description: "Envoyé lorsque le statut d'un dossier change.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Statut du dossier mis à jour</h2>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir le dossier</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'collaborator_added',
        name: 'Ajout collaborateur au dossier',
        category: 'dossier',
        description: "Envoyé lorsqu'un collaborateur est ajouté à un dossier.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Nouvelle collaboration</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir le dossier</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'audience_created',
        name: 'Nouvelle audience',
        category: 'audience',
        description: "Envoyé lors de la création d'une audience.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Nouvelle audience</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir l'audience</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'audience_held',
        name: 'Audience tenue',
        category: 'audience',
        description: "Envoyé lorsqu'une audience est marquée comme tenue.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Audience tenue</h2>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir l'audience</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'audience_updated',
        name: 'Audience modifiée',
        category: 'audience',
        description: "Envoyé lorsqu'une audience est modifiée ou reportée.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Audience modifiée</h2>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir l'audience</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'facture_paid',
        name: 'Facture payée',
        category: 'billing',
        description: "Envoyé lorsqu'une facture est marquée comme payée.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Facture payée</h2>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la facture</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'facture_overdue',
        name: 'Facture impayée',
        category: 'billing',
        description: "Envoyé lorsqu'une facture est marquée comme impayée.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Facture impayée</h2>
          <p style="color:#dc2626;">{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la facture</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'paiement_received',
        name: 'Paiement reçu',
        category: 'billing',
        description: "Envoyé lorsqu'un paiement est enregistré.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Paiement reçu</h2>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir la facture</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
      {
        code: 'document_uploaded',
        name: 'Document partagé',
        category: 'dossier',
        description: "Envoyé lorsqu'un document est partagé avec le client.",
        subject: '{{title}}',
        body_html: `
          <h2 style="margin-top:0;">Nouveau document</h2>
          <p>Bonjour,</p>
          <p>{{content}}</p>
          {{#if link}}<p style="text-align:center;margin:24px 0;"><a href="{{link}}" style="background:{{brandColor}};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Voir le document</a></p>{{/if}}`,
        variables: JSON.stringify(['title', 'content', 'link', 'cabinetName', 'brandColor']),
        is_system: true,
        is_active: true,
      },
    ];

    // Classification du destinataire (audience) par code de template.
    // Tout code absent de la map est considéré comme 'both' (mixte).
    const AUDIENCE_BY_CODE: Record<string, 'client' | 'collaborator' | 'both'> = {
      // Authentification / comptes → collaborateurs internes
      account_opening:        'collaborator',
      reset_password:         'collaborator',
      account_activation:     'collaborator',
      // Coordination interne
      dossier_created:        'collaborator',
      diligence_assigned:     'collaborator',
      diligence_completed:    'collaborator',
      collaborator_added:     'collaborator',
      audience_created:       'collaborator',
      audience_held:          'collaborator',
      // Communications orientées client
      audience_reminder:      'client',
      invoice_issued:         'client',
      document_uploaded:      'client',
      // Mixtes (peuvent cibler client ou équipe)
      dossier_status_changed: 'both',
      audience_updated:       'both',
      facture_paid:           'both',
      facture_overdue:        'both',
      paiement_received:      'both',
    };

    for (const data of templates) {
      const audience = AUDIENCE_BY_CODE[data.code!] ?? 'both';
      const existing = await findOneForTenant(repository, 'code', data.code);
      if (!existing) {
        await repository.save(repository.create({ ...data, audience }));
        console.log(`Template mail créé : ${data.code} (${audience})`);
      } else {
        // Applique la classification d'audience aux templates système existants.
        if (existing.audience !== audience) {
          existing.audience = audience;
          await repository.save(existing);
          console.log(`Template mail mis à jour (audience=${audience}) : ${data.code}`);
        } else {
          console.log(`Template mail déjà existant, ignoré : ${data.code}`);
        }
      }
    }
  }
}
