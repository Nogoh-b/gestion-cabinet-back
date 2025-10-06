// src/modules/procedures/entities/procedure_type.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';

@Entity('procedure_types')
export class ProcedureType extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 100, nullable: false })
  name: string;

  @Column({ name: 'code', length: 50, unique: true, nullable: false })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_subtype', default: false })
  is_subtype: boolean;

  @Column({ name: 'parent_id', nullable: true })
  parent_id: number;

  @Column({ name: 'hierarchy_level', type: 'int', default: 1 })
  hierarchy_level: number; // 1 = type principal, 2 = sous-type

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @Column({ name: 'required_documents', type: 'json', nullable: true })
  required_documents: string[];

  @Column({ name: 'average_duration', type: 'int', nullable: true })
  average_duration: number;

  @Column({ name: 'specific_jurisdictions', type: 'json', nullable: true })
  specific_jurisdictions: string[];

  // Relations
  @ManyToOne(() => ProcedureType, (type) => type.subtypes, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: ProcedureType;

  @OneToMany(() => ProcedureType, (type) => type.parent)
  subtypes: ProcedureType[];  
  
  @OneToMany(() => Dossier, (dossier) => dossier.procedure_type)
  dossiers: Dossier[];

  // Getters
  get is_main_type(): boolean {
    return !this.is_subtype && this.hierarchy_level === 1;
  }

  get is_sub_type(): boolean {
    return this.is_subtype && this.hierarchy_level === 2;
  }

  get full_path(): string {
    if (this.parent) {
      return `${this.parent.name} > ${this.name}`;
    }
    return this.name;
  }

  // La catégorie est déduite du type principal
  get category(): string {
    if (this.is_main_type) {
      return this.name.toLowerCase();
    }
    return this.parent?.name.toLowerCase() || '';
  }
}