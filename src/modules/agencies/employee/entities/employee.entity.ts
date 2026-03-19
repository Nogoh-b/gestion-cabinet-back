import { BaseEntity } from 'src/core/entities/baseEntity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Column,
  ManyToOne,
  JoinColumn,
  Entity,
  OneToOne,
  BeforeInsert,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { Branch } from '../../branch/entities/branch.entity';
import { Expose } from 'class-transformer';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';


export enum EmployeePosition {
  AVOCAT = 'avocat',
  SECRETAIRE = 'secretaire',
  ASSISTANT = 'assistant',
  STAGIAIRE = 'stagiaire',
  HUISSIER = 'huissier',
  ADMINISTRATIF = 'administratif',
}

export enum EmployeeStatus {
  ACTIVE = 1,
  INACTIVE = 0,
  SUSPENDED = -1,
  VACATION = 2,
}

@Entity('employee')
export class Employee extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number; // sera égal à user.id

  @OneToOne(() => User, (user) => user.employee)
  @JoinColumn({ name: 'id' }) // Clé étrangère et clé primaire en même temps
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;
  @Column({ name: 'branch_id', type: 'int', nullable: true }) // ✅ Changé en 'date'
  branch_id: Date;
  @ApiProperty({ enum: EmployeePosition })
  @Column({ type: 'enum', enum: EmployeePosition })
  position: EmployeePosition;

  @ApiProperty({ example: '2023-01-01' })
  @Column({ type: 'date', name: 'hire_date' })
  hireDate: Date;

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint', default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  // ✅ CHAMPS AJOUTÉS pour le système juridique
  @ApiProperty({ example: 'Droit des affaires' })
  @Column({ name: 'specialization', length: 255, nullable: true })
  specialization: string;

  @ApiProperty({ example: 'A123456' })
  @Column({ name: 'bar_association_number', length: 50, nullable: true })
  bar_association_number: string;

  @ApiProperty({ example: 'Paris' })
  @Column({ name: 'bar_association_city', length: 100, nullable: true })
  bar_association_city: string;

  @ApiProperty({ example: 5 })
  @Column({ name: 'years_of_experience', type: 'int', nullable: true })
  years_of_experience: number;

  @ApiProperty({ example: 150.00 })
  @Column({ name: 'hourly_rate', type: 'decimal', precision: 8, scale: 2, nullable: true })
  hourly_rate: number;

  @ApiProperty({ example: true })
  @Column({ name: 'is_available', default: true })
  is_available: boolean;

  @ApiProperty({ example: 50 })
  @Column({ name: 'max_dossiers', type: 'int', default: 50 })
  max_dossiers: number;

  @ApiProperty({ example: 'Avocat spécialisé en droit commercial...' })
  @Column({ type: 'text', nullable: true })
  bio: string;

  @ApiProperty({ example: ['Français', 'Anglais', 'Espagnol'] })
  @Column({ name: 'languages', type: 'json', nullable: true })
  languages: string[];

  @ApiProperty({ example: ['Droit des sociétés', 'Contrats', 'Propriété intellectuelle'] })
  @Column({ name: 'expertise_areas', type: 'json', nullable: true })
  expertise_areas: string[];

  @ApiProperty({ example: 'EMP-2024-001' })
  @Column({ name: 'employee_number', length: 50, unique: true, nullable: true })
  employee_number: string;

  @ApiProperty({ example: '2024-01-01' })
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birth_date: Date;

  @ApiProperty({ example: '123 Rue du Palais, 75001 Paris' })
  @Column({ name: 'professional_address', type: 'text', nullable: true })
  professional_address: string;

  @ApiProperty({ example: '+33 1 45 67 89 00' })
  @Column({ name: 'professional_phone', length: 20, nullable: true })
  professional_phone: string;

  @ApiProperty({ example: 'MC123456789' })
  @Column({ name: 'siret_number', length: 14, nullable: true })
  siret_number: string;

  @ApiProperty({ example: 'FR12345678901' })
  @Column({ name: 'tva_number', length: 20, nullable: true })
  tva_number: string;

  // Relations
  @OneToMany(() => Dossier, (dossier) => dossier.lawyer)
  managed_dossiers: Dossier[];

  @ManyToMany(() => Dossier, dossier => dossier.collaborators)
  collaborating_dossiers: Dossier[];

    
  @OneToMany(() => Diligence, diligence => diligence.assigned_lawyer)
  assigned_diligences: Diligence[]; 

  @BeforeInsert()
  setDefaultHireDate() {
    console.log(
      'Aucune date de naissance spécifiée, utilisation de la date actuelle',
    );
    if (!this.hireDate) {
      this.hireDate = new Date(); // Valeur par défaut
    }

    // ✅ Générer le numéro d'employé si vide
    if (!this.employee_number) {
      this.employee_number = this.generateEmployeeNumber();
    }
  }

  // ✅ GETTERS AJOUTÉS
  @Expose()
  get full_name(): string {
    return this.user?.full_name || '';
  }
  @Expose()

  get email(): string {
    return this.user?.email || '';
  }
  @Expose()

  get lastSeen(): string {
    return this.user?.lastSeen || '';
  }
  @Expose()

  get username(): string {
    return this.user?.username || '';
  }
  @Expose()

  get is_online(): boolean {
    return this.user?.is_online || false;
  }
  @Expose()

  get is_avocat(): boolean {
    return this.position === EmployeePosition.AVOCAT;
  }
  @Expose()

  get is_secretaire(): boolean {
    return this.position === EmployeePosition.SECRETAIRE;
  }
  @Expose()

  get is_huissier(): boolean {
    return this.position === EmployeePosition.HUISSIER;
  }
  @Expose()

  get current_dossier_count(): number {
    return this.managed_dossiers?.filter(d => d.is_active).length || 0;
  }
  @Expose()

  get can_accept_more_dossiers(): boolean {
    return this.current_dossier_count < this.max_dossiers;
  }
  @Expose()

  get is_active(): boolean {
    return this.status === EmployeeStatus.ACTIVE;
  }
  @Expose()

  get experience_level(): string {
    if (!this.years_of_experience) return 'Débutant';
    if (this.years_of_experience < 3) return 'Junior';
    if (this.years_of_experience < 8) return 'Confirmé';
    return 'Senior';
  }

  // ✅ MÉTHODE pour générer le numéro d'employé
  private generateEmployeeNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const positionCode = this.position.substring(0, 3).toUpperCase();
    return `EMP-${positionCode}-${year}-${random}`;
  }

  // ✅ MÉTHODES MÉTIER
  canManageDossiers(): boolean {
    return this.is_avocat && this.is_active && this.can_accept_more_dossiers;
  }

  canValidateDocuments(): boolean {
    return this.is_avocat || this.position === EmployeePosition.HUISSIER;
  }

  getHourlyRateForClient(clientType: string): number {
    let rate = this.hourly_rate || 0;
    
    // Ajustements selon le type de client
    switch (clientType) {
      case 'particulier':
        rate *= 1.0; // Tarif standard
        break;
      case 'professionnel':
        rate *= 1.2; // Majoration pour professionnels
        break;
      case 'entreprise':
        rate *= 1.5; // Majoration pour entreprises
        break;
    }
    
    return rate;
  }
}