import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';

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
@Entity('pdf_templates')
@Index(['entity_type', 'variant'])
export class PdfTemplate extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** Code unique et stable (ex. facture_comptable). Sert d'identifiant logique. */
  @Column({ type: 'varchar', length: 80, unique: true })
  code: string;

  /** Libellé affiché dans l'interface de gestion. */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Type d'entité concernée : facture, dossier, client, audience, diligence, general. */
  @Column({ type: 'varchar', length: 40, name: 'entity_type' })
  entity_type: string;

  /** Variante : standard, comptable, client, interne. */
  @Column({ type: 'varchar', length: 40, default: 'standard' })
  variant: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Titre affiché en en-tête du document généré. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  title: string;

  /** Gabarit HTML avec variables {{var}}. */
  @Column({ type: 'longtext', name: 'body_html' })
  body_html: string;

  /** Liste JSON des variables disponibles, ex. '["numero","client.full_name"]'. */
  @Column({ type: 'text', nullable: true })
  variables: string;

  /** portrait | landscape */
  @Column({ type: 'varchar', length: 20, default: 'portrait' })
  orientation: string;

  /** a4 | a5 | letter ... */
  @Column({ type: 'varchar', length: 10, name: 'paper_size', default: 'a4' })
  paper_size: string;

  /** Police du document (clé de FONTS côté front, ex. 'inter'). Null = défaut. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'font_family' })
  font_family: string | null;

  /** Bloc en-tête réutilisable. Null = bloc PDF par défaut. */
  @Column({ type: 'int', nullable: true, name: 'header_block_id' })
  header_block_id: number | null;

  /** Bloc pied de page réutilisable. Null = bloc PDF par défaut. */
  @Column({ type: 'int', nullable: true, name: 'footer_block_id' })
  footer_block_id: number | null;

  /** Modèle système : non supprimable, code non modifiable. */
  @Column({ type: 'tinyint', default: 0, name: 'is_system' })
  is_system: boolean;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  is_active: boolean;

}
