import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { TypeJournal } from '../enums/comptabilite.enums';
import { Ecriture } from './ecriture.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('journaux_comptables')
@BusinessTable({
  label: 'Journaux comptables',
  description: 'Journaux dans lesquels sont enregistrées les écritures comptables (ventes, achats, caisse, banque, opérations diverses).',
  icon: '📔',
  category: 'finance',
})
export class JournalComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du journal',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ length: 10 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code court du journal',
    example: 'VTE, ACH, CAI, BAN, OD',
    importance: 'critical',
    group: 'identification',
  })
  code: string;

  @Column({ length: 255 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Nom complet du journal',
    example: 'Journal des ventes, Journal de banque',
    importance: 'high',
    group: 'identification',
  })
  libelle: string;

  @Column({ type: 'enum', enum: TypeJournal })
  @BusinessColumn({
    label: 'Type de journal',
    description: "BD: 'VENTES', 'ACHATS', 'CAISSE', 'BANQUE', 'OD'.",
    importance: 'critical',
    group: 'classification',
  })
  typeJournal: TypeJournal;

  @Column({ default: true })
  @BusinessColumn({
    label: 'Actif',
    description: 'Indique si le journal est encore utilisable',
    importance: 'medium',
    group: 'état',
  })
  actif: boolean;

  @OneToMany(() => Ecriture, e => e.journal)
  ecritures: Ecriture[];
}
