import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

/**
 * Catégorie fonctionnelle d'un template de mail.
 */
export type MailTemplateCategory =
  | 'auth' // ouverture de compte, reset password, activation
  | 'dossier' // notifications dossier
  | 'audience' // rappels d'audience
  | 'billing' // facturation
  | 'general'; // divers

/**
 * Cible (destinataire) du template — permet de scinder les modèles destinés au
 * client de ceux destinés aux collaborateurs internes (avocats, secrétaires…)
 * dans l'interface de gestion.
 *  - client       : message à destination du client final.
 *  - collaborator : message interne (notification d'équipe, coordination).
 *  - both         : utilisable dans les deux contextes (défaut).
 */
export type MailTemplateAudience = 'client' | 'collaborator' | 'both';

@SharedAcrossTenants()
@BusinessTable({
  label: 'Modèles de mails',
  description: 'Modèles d’e-mails du cabinet (ouverture de compte, notifications dossier, rappels d’audience, facturation…) : objet + corps HTML avec variables {{ }}, en-tête et pied de page réutilisables. Le chat peut les lister, lire, créer et modifier.',
  icon: '✉️',
  category: 'communication',
})
@Entity('mail_templates')
@Unique(['tenant_id', 'code'])
export class MailTemplate extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement par le système',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  /**
   * Code unique du template (ex: "account_opening", "reset_password").
   * Sert de clé d'appel depuis le code applicatif.
   */
  @Column({ type: 'varchar', length: 80 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique du template (ex. account_opening, dossier_created_client). Sert d’identifiant logique : l’utiliser pour retrouver un modèle.',
    example: 'dossier_created_client',
    importance: 'critical',
    group: 'identification',
  })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  @BusinessColumn({
    label: 'Nom',
    description: 'Libellé affiché dans l’interface de gestion.',
    importance: 'high',
    group: 'identification',
  })
  name: string;

  @Column({ type: 'varchar', length: 30, default: 'general' })
  @BusinessColumn({
    label: 'Catégorie fonctionnelle',
    description: 'auth, dossier, audience, billing ou general.',
    example: 'dossier',
    importance: 'high',
  })
  category: MailTemplateCategory;

  /**
   * Destinataire visé : 'client' | 'collaborator' | 'both'.
   * Utilisé par la page de gestion pour scinder (et replier) les sections.
   */
  @Column({ type: 'varchar', length: 20, default: 'both' })
  @BusinessColumn({
    label: 'Destinataire visé',
    description: 'client, collaborator (interne) ou both.',
    example: 'client',
    importance: 'high',
  })
  audience: MailTemplateAudience;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description du modèle.',
    importance: 'low',
  })
  description: string | null;

  /** Objet de l'e-mail (supporte les variables Handlebars {{ }}). */
  @Column({ type: 'varchar', length: 255 })
  @BusinessColumn({
    label: 'Objet de l’e-mail',
    description: 'Objet de l’e-mail, avec variables {{ }} si besoin.',
    importance: 'critical',
    group: 'contenu',
  })
  subject: string;

  /** Corps HTML du template (sans header/footer — ajoutés au rendu). */
  @Column({ type: 'longtext' })
  @BusinessColumn({
    label: 'Corps HTML',
    description: 'Corps HTML du template (en-tête et pied ajoutés au rendu). Variables {{ }} : ne jamais en inventer, n’utiliser que celles listées dans variables.',
    importance: 'critical',
    group: 'contenu',
  })
  body_html: string;

  /**
   * Liste des variables disponibles dans le template (JSON string)
   * — utilisée par l'interface d'édition pour guider l'utilisateur.
   */
  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Variables disponibles',
    description: 'Liste JSON des variables utilisables dans le template.',
    importance: 'high',
    group: 'contenu',
  })
  variables: string | null;

  /** Police du mail (clé de FONTS côté front, ex. 'inter'). Null = défaut. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'font_family' })
  @BusinessColumn({
    label: 'Police',
    description: 'Clé de police côté front. Null = police par défaut.',
    importance: 'low',
  })
  font_family: string | null;

  /** Bloc en-tête réutilisable. Null = bloc mail par défaut. */
  @Column({ type: 'int', nullable: true, name: 'header_block_id' })
  @BusinessColumn({
    label: 'Bloc d’en-tête',
    description: 'ID du bloc template_blocks utilisé comme en-tête. Null = bloc mail par défaut.',
    importance: 'medium',
  })
  header_block_id: number | null;

  /** Bloc pied de page réutilisable. Null = bloc mail par défaut. */
  @Column({ type: 'int', nullable: true, name: 'footer_block_id' })
  @BusinessColumn({
    label: 'Bloc de pied de page',
    description: 'ID du bloc template_blocks utilisé comme pied de page. Null = bloc mail par défaut.',
    importance: 'medium',
  })
  footer_block_id: number | null;

  /** Template système prédéfini (non supprimable, seulement éditable). */
  @Column({ type: 'tinyint', default: 0, name: 'is_system' })
  @BusinessColumn({
    label: 'Modèle système',
    description: 'Modèle prédéfini : non supprimable. Géré par le système, jamais modifié par l’IA.',
    importance: 'low',
    ignored: true,
  })
  is_system: boolean;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  @BusinessColumn({
    label: 'Actif',
    description: 'Modèle utilisable (false = désactivé).',
    importance: 'medium',
  })
  is_active: boolean;
}
