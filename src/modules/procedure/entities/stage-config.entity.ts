// entities/stage-config.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Stage } from './stage.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { BaseEntity } from 'src/core/entities/baseEntity';

@Entity('stage_configs')
@BusinessTable({
  label: 'Configurations d\'étape',
  description: 'Configuration des fonctionnalités autorisées pour une étape (documents, diligences, factures, audiences)',
  icon: '⚙️',
  category: 'procedure',
  ignored: true,
})
export class StageConfig extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant', description: 'Identifiant unique', importance: 'low', group: 'technique', ignored: true })
  id: string;

  @Column({ name: 'stageId' })
  @BusinessColumn({ label: 'Étape', description: 'Référence à l\'étape', importance: 'high', group: 'relation', ignored: true })
  stageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

    @Column({ type: 'boolean', default: false })
  @BusinessColumn({ label: 'Documents autorisés', description: 'Autorise les documents', importance: 'low', group: 'configuration', ignored: true })
  allowDocuments: boolean;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({ label: 'Diligences autorisées', description: 'Autorise les diligences', importance: 'low', group: 'configuration', ignored: true })
  allowDiligences: boolean;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({ label: 'Factures autorisées', description: 'Autorise les factures', importance: 'low', group: 'configuration', ignored: true })
  allowInvoices: boolean;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({ label: 'Audiences autorisées', description: 'Autorise les audiences', importance: 'low', group: 'configuration', ignored: true })
  allowHearings: boolean;

  @Column({ type: 'text', nullable: true })
  documentTypesAllowed: string | null;

  @Column({ type: 'text', nullable: true })
  diligenceConfig: string | null;

  @Column({ type: 'text', nullable: true })
  hearingConfig: string | null;

  @Column({ type: 'text', nullable: true })
  invoiceConfig: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}