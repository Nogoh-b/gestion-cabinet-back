import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompteComptable } from './compte.entity';
import { Ecriture } from './ecriture.entity';
import {
  BusinessTable,
  BusinessColumn,
} from 'src/core/decorators/business-metadata.decorator';

/**
 * Lignes de débit/crédit d'une écriture comptable.
 *
 * ⚠️ Pas de write handler dédié pour cette entité : une ligne n'a de sens
 * qu'attachée à une écriture (partie double), elle est donc toujours créée
 * via EcritureWriteHandler (champ "lignes" du plan d'écriture), jamais
 * directement par l'IA. Le @BusinessTable sert uniquement à la LECTURE
 * (consultation du détail d'une écriture).
 */
@Entity('lignes_ecriture_comptable')
@BusinessTable({
  label: "Lignes d'écriture",
  description:
    'Lignes de débit/crédit composant une écriture comptable. Toujours rattachées à une écriture et un compte.',
  icon: '➖',
  category: 'finance',
})
export class LigneEcriture {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la ligne',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ name: 'ecriture_id' })
  ecriture_id: number;

  @ManyToOne(() => Ecriture, (e) => e.lignes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ecriture_id' })
  @BusinessColumn({
    label: 'Écriture',
    description: 'Écriture comptable à laquelle appartient la ligne',
    importance: 'critical',
    group: 'relation',
  })
  ecriture: Ecriture;

  @Column({ name: 'compte_id' })
  compte_id: number;

  @ManyToOne(() => CompteComptable, { eager: true })
  @JoinColumn({ name: 'compte_id' })
  @BusinessColumn({
    label: 'Compte',
    description: 'Compte comptable débité ou crédité',
    importance: 'critical',
    group: 'relation',
  })
  compte: CompteComptable;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  @BusinessColumn({
    label: 'Débit',
    description: 'Montant au débit',
    format: 'currency',
    importance: 'critical',
    group: 'montants',
  })
  debit: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  @BusinessColumn({
    label: 'Crédit',
    description: 'Montant au crédit',
    format: 'currency',
    importance: 'critical',
    group: 'montants',
  })
  credit: number;

  @Column({ length: 500, nullable: true })
  @BusinessColumn({
    label: 'Libellé',
    description:
      "Libellé spécifique de la ligne (par défaut, celui de l'écriture)",
    importance: 'medium',
    group: 'contenu',
  })
  libelle: string;
}
