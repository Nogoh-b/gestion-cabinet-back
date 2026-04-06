// src/modules/procedures/entities/procedure_type.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { ProcedureTemplate } from 'src/modules/procedure/entities/procedure-template.entity';
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

  @Column({ name: 'procedure_template_id', nullable: true })
  procedure_template_id: string;

  @Column({ name: 'specific_jurisdictions', type: 'json', nullable: true })
  specific_jurisdictions: string[];

  // Relations
  @ManyToOne(() => ProcedureType, (type) => type.subtypes, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: ProcedureType;

  @ManyToOne(() => ProcedureTemplate)
  @JoinColumn({ name: 'procedure_template_id' })
  procedure_template: ProcedureTemplate;

  @OneToMany(() => ProcedureType, (type) => type.parent)
  subtypes: ProcedureType[];  
  
  @OneToMany(() => Dossier, (dossier) => dossier.procedure_type)
  dossiers: Dossier[];

  // Getters existants
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

  get category(): string {
    if (this.is_main_type) {
      return this.name.toLowerCase();
    }
    return this.parent?.name.toLowerCase() || '';
  }

  // Nouveaux getters intéressants
  get has_subtypes(): boolean {
    return this.subtypes && this.subtypes.length > 0;
  }

  get subtypes_count(): number {
    return this.subtypes?.length || 0;
  }

  get dossiers_count(): number {
    return this.dossiers?.length || 0;
  }

  get is_leaf(): boolean {
    return !this.has_subtypes;
  }

  get hierarchy_path(): string[] {
    const path = [this.name];
    let current = this.parent;
    while (current) {
      path.unshift(current.name);
      current = current.parent;
    }
    return path;
  }

  get hierarchy_path_with_codes(): string {
    const path = [`${this.name} (${this.code})`];
    let current = this.parent;
    while (current) {
      path.unshift(`${current.name} (${current.code})`);
      current = current.parent;
    }
    return path.join(' → ');
  }

  get document_count(): number {
    return this.required_documents?.length || 0;
  }

  get has_required_documents(): boolean {
    return this.document_count > 0;
  }

  get required_documents_list(): string {
    return 'Aucun document requis';
  }

  get jurisdictions_count(): number {
    return this.specific_jurisdictions?.length || 0;
  }

  get has_specific_jurisdictions(): boolean {
    return this.jurisdictions_count > 0;
  }

  get specific_jurisdictions_list(): string {
    if (!this.specific_jurisdictions) {
      return 'Toutes juridictions';
    }
    
    // If it's an array, join it
    if (Array.isArray(this.specific_jurisdictions)) {
      return this.specific_jurisdictions.join(', ');
    }
    
    // If it's a string, return it as is
    if (typeof this.specific_jurisdictions === 'string') {
      return this.specific_jurisdictions;
    }
    
    // Fallback
    return 'Toutes juridictions';
  }
 

  get duration_display(): string {
    if (!this.average_duration) return 'Non défini';
    
    const days = this.average_duration;
    if (days < 30) {
      return `${days} jour${days > 1 ? 's' : ''}`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      return `environ ${months} mois`;
    } else {
      const years = Math.floor(days / 365);
      return `environ ${years} an${years > 1 ? 's' : ''}`;
    }
  }

  get status_display(): string {
    return this.is_active ? 'Actif' : 'Inactif';
  }

  get status_color(): string {
    return this.is_active ? 'green' : 'red';
  }

  get type_display(): string {
    // if (this.is_main_type) return 'Type principal';
    if (this.is_main_type) return 'Type principal';
    if (this.is_sub_type) return 'Sous-type';
    return 'Non catégorisé';
  }

  get hierarchy_level_display(): string {
    return `Niveau ${this.hierarchy_level}`;
  }

  get summary(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      type: this.type_display,
      status: this.status_display,
      hierarchy: this.hierarchy_path_with_codes,
      subtypes: this.subtypes_count,
      dossiers: this.dossiers_count,
      documents: this.document_count,
      jurisdictions: this.jurisdictions_count,
      duration: this.duration_display
    };
  }

  get tree_display(): string {
    const indent = '  '.repeat(this.hierarchy_level - 1);
    const prefix = this.is_main_type ? '📁' : (this.is_sub_type ? '📄' : '📌');
    const status = this.is_active ? '✅' : '❌';
    return `${indent}${prefix} ${this.name} (${this.code}) ${status}`;
  }
}