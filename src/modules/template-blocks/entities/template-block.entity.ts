import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

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
@SharedAcrossTenants()
@BusinessTable({
  label: 'Blocs d’en-tête et pied de page',
  description: 'Blocs réutilisables greffés aux modèles PDF et mails via header_block_id / footer_block_id (un bloc par couple canal/nature marqué is_default est utilisé par défaut). Le chat peut les lister, lire, créer et modifier.',
  icon: '🧩',
  category: 'document',
})
@Entity('template_blocks')
@Index(['channel', 'kind'])
@Unique(['tenant_id', 'code'])
export class TemplateBlock extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement par le système',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  /** Code unique et stable (ex. pdf_header_defaut). */
  @Column({ type: 'varchar', length: 80 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique et stable du bloc (ex. pdf_header_defaut). Sert d’identifiant logique : l’utiliser pour retrouver un bloc.',
    example: 'pdf_header_defaut',
    importance: 'critical',
    group: 'identification',
  })
  code: string;

  /** Libellé affiché dans l'interface de gestion. */
  @Column({ type: 'varchar', length: 150 })
  @BusinessColumn({
    label: 'Nom',
    description: 'Libellé affiché dans l’interface de gestion.',
    importance: 'high',
    group: 'identification',
  })
  name: string;

  /** Canal : mail | pdf. */
  @Column({ type: 'varchar', length: 10 })
  @BusinessColumn({
    label: 'Canal',
    description: 'mail ou pdf (rendus techniquement différents).',
    example: 'pdf',
    importance: 'high',
  })
  channel: TemplateBlockChannel;

  /** Nature : header | footer. */
  @Column({ type: 'varchar', length: 10 })
  @BusinessColumn({
    label: 'Nature',
    description: 'header (en-tête) ou footer (pied de page).',
    example: 'header',
    importance: 'high',
  })
  kind: TemplateBlockKind;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description du bloc.',
    importance: 'low',
  })
  description: string | null;

  /** Gabarit HTML du bloc avec variables {{var}} (cabinet, page, etc.). */
  @Column({ type: 'longtext', name: 'body_html' })
  @BusinessColumn({
    label: 'Corps HTML',
    description: 'Gabarit HTML du bloc avec variables {{var}} (cabinet, page…). Ne jamais inventer de variables : n’utiliser que celles listées dans variables.',
    importance: 'critical',
    group: 'contenu',
  })
  body_html: string;

  /** Liste JSON des variables disponibles, ex. '["cabinet.name","year"]'. */
  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Variables disponibles',
    description: 'Liste JSON des variables utilisables dans le bloc.',
    importance: 'high',
    group: 'contenu',
  })
  variables: string | null;

  /**
   * Bloc par défaut pour son couple (channel, kind) : utilisé quand un modèle
   * ne référence explicitement aucun bloc. Un seul bloc par défaut par couple.
   */
  @Column({ type: 'tinyint', default: 0, name: 'is_default' })
  @BusinessColumn({
    label: 'Bloc par défaut',
    description: 'Utilisé quand un modèle ne référence aucun bloc pour ce couple canal/nature. Un seul par couple.',
    importance: 'high',
  })
  is_default: boolean;

  /** Bloc système prédéfini : non supprimable, seulement éditable/désactivable. */
  @Column({ type: 'tinyint', default: 0, name: 'is_system' })
  @BusinessColumn({
    label: 'Bloc système',
    description: 'Bloc prédéfini : non supprimable. Géré par le système, jamais modifié par l’IA.',
    importance: 'low',
    ignored: true,
  })
  is_system: boolean;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  @BusinessColumn({
    label: 'Actif',
    description: 'Bloc utilisable (false = désactivé).',
    importance: 'medium',
  })
  is_active: boolean;
}
