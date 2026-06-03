import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Catégorie fonctionnelle d'un template de mail.
 */
export type MailTemplateCategory =
  | 'auth'        // ouverture de compte, reset password, activation
  | 'dossier'     // notifications dossier
  | 'audience'    // rappels d'audience
  | 'billing'     // facturation
  | 'general';    // divers

/**
 * Cible (destinataire) du template — permet de scinder les modèles destinés au
 * client de ceux destinés aux collaborateurs internes (avocats, secrétaires…)
 * dans l'interface de gestion.
 *  - client       : message à destination du client final.
 *  - collaborator : message interne (notification d'équipe, coordination).
 *  - both         : utilisable dans les deux contextes (défaut).
 */
export type MailTemplateAudience = 'client' | 'collaborator' | 'both';

@Entity('mail_templates')
export class MailTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Code unique du template (ex: "account_opening", "reset_password").
   * Sert de clé d'appel depuis le code applicatif.
   */
  @Column({ type: 'varchar', length: 80, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: 'general' })
  category: MailTemplateCategory;

  /**
   * Destinataire visé : 'client' | 'collaborator' | 'both'.
   * Utilisé par la page de gestion pour scinder (et replier) les sections.
   */
  @Column({ type: 'varchar', length: 20, default: 'both' })
  audience: MailTemplateAudience;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Objet de l'e-mail (supporte les variables Handlebars {{ }}). */
  @Column({ type: 'varchar', length: 255 })
  subject: string;

  /** Corps HTML du template (sans header/footer — ajoutés au rendu). */
  @Column({ type: 'longtext' })
  body_html: string;

  /**
   * Liste des variables disponibles dans le template (JSON string)
   * — utilisée par l'interface d'édition pour guider l'utilisateur.
   */
  @Column({ type: 'text', nullable: true })
  variables: string | null;

  /** Police du mail (clé de FONTS côté front, ex. 'inter'). Null = défaut. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'font_family' })
  font_family: string | null;

  /** Bloc en-tête réutilisable. Null = bloc mail par défaut. */
  @Column({ type: 'int', nullable: true, name: 'header_block_id' })
  header_block_id: number | null;

  /** Bloc pied de page réutilisable. Null = bloc mail par défaut. */
  @Column({ type: 'int', nullable: true, name: 'footer_block_id' })
  footer_block_id: number | null;

  /** Template système prédéfini (non supprimable, seulement éditable). */
  @Column({ type: 'tinyint', default: 0, name: 'is_system' })
  is_system: boolean;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
