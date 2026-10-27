import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

/**
 * Modèle de document PDF personnalisable.
 *
 * Un même type d'entité (ex. « facture ») peut posséder plusieurs variantes :
 *  - standard  : version classique remise au client
 *  - comptable : export destiné à la comptabilité (détails fiscaux, totaux HT/TVA)
 *  - client    : version allégée et commerciale
 *  - interne   : usage interne au cabinet
 *
 * Le corps (`body_html`) est un gabarit HTML contenant des variables `{{var}}`
 * interpolées côté front au moment du rendu (moteur react-pdf-html / GenericPDF).
 */
@SharedAcrossTenants()
@BusinessTable({
  label: 'Modèles de documents PDF',
  description: 'Modèles de documents PDF du cabinet (factures, dossiers, attestations, courriers…) : gabarit HTML avec variables {{var}}, en-tête et pied de page réutilisables. Le chat peut les lister, lire, créer et modifier.',
  icon: '📄',
  category: 'document',
})
@Entity('pdf_templates')
@Index(['entity_type', 'variant'])
@Unique(['tenant_id', 'code'])
export class PdfTemplate extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement par le système',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  /** Code unique et stable (ex. facture_comptable). Sert d'identifiant logique. */
  @Column({ type: 'varchar', length: 80 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique et stable du modèle (ex. facture_comptable). Sert d’identifiant logique : l’utiliser pour retrouver un modèle.',
    example: 'facture_comptable',
    importance: 'critical',
    group: 'identification',
  })
  code: string;

  /** Libellé affiché dans l'interface de gestion. */
  @Column({ type: 'varchar', length: 120 })
  @BusinessColumn({
    label: 'Nom',
    description: 'Libellé affiché dans l’interface de gestion.',
    importance: 'high',
    group: 'identification',
  })
  name: string;

  /** Type d'entité concernée : facture, dossier, client, audience, diligence, general. */
  @Column({ type: 'varchar', length: 40, name: 'entity_type' })
  @BusinessColumn({
    label: 'Type d’entité',
    description: 'Type visé : facture, dossier, client, audience, diligence, general.',
    example: 'facture',
    importance: 'high',
    group: 'identification',
  })
  entity_type: string;

  /** Variante : standard, comptable, client, interne. */
  @Column({ type: 'varchar', length: 40, default: 'standard' })
  @BusinessColumn({
    label: 'Variante',
    description: 'Variante : standard, comptable, client, interne.',
    example: 'standard',
    importance: 'high',
  })
  variant: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description du modèle.',
    importance: 'low',
  })
  description: string;

  /** Titre affiché en en-tête du document généré. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  @BusinessColumn({
    label: 'Titre du document',
    description: 'Titre affiché en en-tête du document généré.',
    importance: 'medium',
  })
  title: string;

  /** Gabarit HTML avec variables {{var}}. */
  @Column({ type: 'longtext', name: 'body_html' })
  @BusinessColumn({
    label: 'Corps HTML',
    description: 'Gabarit HTML du modèle avec variables {{var}} (ex. {{numero}}, {{client.full_name}}). Ne jamais inventer de variables : n’utiliser que celles listées dans variables.',
    importance: 'critical',
    group: 'contenu',
  })
  body_html: string;

  /** Liste JSON des variables disponibles, ex. '["numero","client.full_name"]'. */
  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Variables disponibles',
    description: 'Liste JSON des variables utilisables dans body_html (ex. ["numero","client.full_name"]).',
    importance: 'high',
    group: 'contenu',
  })
  variables: string;

  /** portrait | landscape */
  @Column({ type: 'varchar', length: 20, default: 'portrait' })
  @BusinessColumn({
    label: 'Orientation',
    description: 'portrait ou landscape.',
    example: 'portrait',
    importance: 'low',
  })
  orientation: string;

  /** a4 | a5 | letter ... */
  @Column({ type: 'varchar', length: 10, name: 'paper_size', default: 'a4' })
  @BusinessColumn({
    label: 'Format papier',
    description: 'a4, a5, letter…',
    example: 'a4',
    importance: 'low',
  })
  paper_size: string;

  /** Police du document (clé de FONTS côté front, ex. 'inter'). Null = défaut. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'font_family' })
  @BusinessColumn({
    label: 'Police',
    description: 'Clé de police côté front (ex. inter). Null = police par défaut.',
    importance: 'low',
  })
  font_family: string | null;

  /** Bloc en-tête réutilisable. Null = bloc PDF par défaut. */
  @Column({ type: 'int', nullable: true, name: 'header_block_id' })
  @BusinessColumn({
    label: 'Bloc d’en-tête',
    description: 'ID du bloc template_blocks utilisé comme en-tête. Null = bloc PDF par défaut.',
    importance: 'medium',
  })
  header_block_id: number | null;

  /** Bloc pied de page réutilisable. Null = bloc PDF par défaut. */
  @Column({ type: 'int', nullable: true, name: 'footer_block_id' })
  @BusinessColumn({
    label: 'Bloc de pied de page',
    description: 'ID du bloc template_blocks utilisé comme pied de page. Null = bloc PDF par défaut.',
    importance: 'medium',
  })
  footer_block_id: number | null;

  /** Taille et interligne du texte, marges, numéros de page (éditeur Word). Null = rendu historique. */
  @Column({ type: 'json', nullable: true, name: 'layout_options' })
  @BusinessColumn({
    label: 'Mise en page',
    description: 'Options JSON : font_size (pt), line_height, margins (narrow|normal|wide), page_numbers. Null = mise en page par défaut.',
    importance: 'low',
  })
  layout_options: { font_size?: number | null; line_height?: number | null; margins?: 'narrow' | 'normal' | 'wide' | null; page_numbers?: boolean } | null;

  /** Modèle système : non supprimable, code non modifiable. */
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
