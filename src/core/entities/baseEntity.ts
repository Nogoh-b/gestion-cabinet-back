import {
  BaseEntity as TypeORMBaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn
} from 'typeorm';
import { BusinessColumn } from '../decorators/business-metadata.decorator';

export abstract class BaseEntity  extends TypeORMBaseEntity{
  // @PrimaryGeneratedColumn()
  // @BusinessColumn({
  //   label: 'Identifiant',
  //   description: 'Identifiant unique technique, généré automatiquement',
  //   importance: 'low',
  //   group: 'technique'
  // })
  // id: number;

  @CreateDateColumn({ name: 'created_at' })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date et heure de création de l\'enregistrement',
    format: 'date',
    importance: 'medium',
    group: 'audit'
  })
  created_at: Date;


  @UpdateDateColumn({ name: 'updated_at' })
  @BusinessColumn({
    label: 'Date de modification',
    description: 'Date et heure de la dernière modification',
    format: 'date',
    importance: 'low',
    group: 'audit'
  })
  updated_at: Date;


  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  @BusinessColumn({
    label: 'Date de suppression',
    description: 'Date de suppression logique (null = actif, non null = supprimé)',
    format: 'date',
    importance: 'medium',
    group: 'audit',
    ignored: true 
  })
  deleted_at: Date | null = null;

}