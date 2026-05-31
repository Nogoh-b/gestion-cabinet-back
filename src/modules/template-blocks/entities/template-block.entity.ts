import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Canal de rendu auquel s'applique le bloc. */
export type TemplateBlockChannel = 'mail' | 'pdf';

/** Nature du bloc : en-tête (haut) ou pied de page (bas). */
export type TemplateBlockKind = 'header' | 'footer';

/**
 * Bloc d'en-tête / pied de page réutilisable.
 *
 * Un bloc est édité une seule fois puis « greffé » à autant de modèles
 * (mail ou PDF) que souhaité. Les modèles référencent un bloc via
 * `header_block_id` / `footer_block_id`. Si un modèle ne référence aucun bloc,
 * le bloc marqué `is_default` pour le couple (channel, kind) est utilisé.
 *
 * Les blocs sont séparés par canal (`channel`) car le rendu mail (HTML email,
 * styles inline, tableaux) et le rendu PDF (react-pdf, sous-ensemble CSS) sont
 * techniquement différents.
 */
@Entity('template_blocks')
@Index(['channel', 'kind'])
export class TemplateBlock {
  @PrimaryGeneratedColumn()
  id: number;

  /** Code unique et stable (ex. pdf_header_defaut). */
  @Column({ type: 'varchar', length: 80, unique: true })
  code: string;

  /** Libellé affiché dans l'interface de gestion. */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Canal : mail | pdf. */
  @Column({ type: 'varchar', length: 10 })
  channel: TemplateBlockChannel;

  /** Nature : header | footer. */
  @Column({ type: 'varchar', length: 10 })
  kind: TemplateBlockKind;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Gabarit HTML du bloc avec variables {{var}} (cabinet, page, etc.). */
  @Column({ type: 'longtext', name: 'body_html' })
  body_html: string;

  /** Liste JSON des variables disponibles, ex. '["cabinet.name","year"]'. */
  @Column({ type: 'text', nullable: true })
  variables: string | null;

  /**
   * Bloc par défaut pour son couple (channel, kind) : utilisé quand un modèle
   * ne référence explicitement aucun bloc. Un seul bloc par défaut par couple.
   */
  @Column({ type: 'tinyint', default: 0, name: 'is_default' })
  is_default: boolean;

  /** Bloc système prédéfini : non supprimable, seulement éditable/désactivable. */
  @Column({ type: 'tinyint', default: 0, name: 'is_system' })
  is_system: boolean;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
