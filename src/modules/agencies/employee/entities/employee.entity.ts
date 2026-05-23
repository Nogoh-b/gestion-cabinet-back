import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

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
@BusinessTable({
  label: 'Collaborateurs',
  description: 'Gestion des avocats et collaborateurs du cabinet. Un collaborateur peut être avocat, secrétaire, assistant, stagiaire, huissier ou personnel administratif. Chaque collaborateur est lié à un utilisateur pour l\'authentification.',
  icon: '👥',
  category: 'ressources'
})
export class Employee extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique lié à l\'utilisateur',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @OneToOne(() => User, (user) => user.employee)
  @JoinColumn({ name: 'id' })
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Agence/succursale à laquelle le collaborateur est rattaché',
    importance: 'high',
    group: 'rattachement'
  })
  branch?: Branch;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branch_id: Date; // Note: devrait être number, pas Date

  @ApiProperty({ enum: EmployeePosition })
  @Column({ type: 'enum', enum: EmployeePosition })
  @BusinessColumn({
    label: 'Fonction',
    description: 'avocat, secretaire, assistant, stagiaire, huissier, administratif',
    example: 'avocat',
    importance: 'critical',
    group: 'identification'
  })
  position: EmployeePosition;

  @ApiProperty({ example: '2023-01-01' })
  @Column({ type: 'date', name: 'hire_date' })
  @BusinessColumn({
    label: "Date d'embauche",
    description: 'Date de début du contrat',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  hireDate: Date;

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint', default: EmployeeStatus.ACTIVE })
  @BusinessColumn({
    label: 'Statut',
    description: '1=Actif, 0=Inactif, -1=Suspendu, 2=Vacation',
    example: '1 = Actif',
    importance: 'high',
    group: 'état'
  })
  status: EmployeeStatus;

  // ✅ CHAMPS SPÉCIFIQUES AU MÉTIER D'AVOCAT
  @ApiProperty({ example: 'Droit des affaires' })
  @Column({ name: 'specialization', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Spécialisation',
    description: "Domaine de spécialisation de l'avocat",
    example: 'Droit des affaires, Droit pénal, Droit de la famille',
    importance: 'high',
    group: 'compétences'
  })
  specialization: string;

  @ApiProperty({ example: 'A123456' })
  @Column({ name: 'bar_association_number', length: 50, nullable: true })
  @BusinessColumn({
    label: "Numéro d'avocat (Barreau)",
    description: "Numéro d'inscription au barreau",
    example: 'A123456',
    importance: 'high',
    group: 'identification'
  })
  bar_association_number: string;

  @ApiProperty({ example: 'Paris' })
  @Column({ name: 'bar_association_city', length: 100, nullable: true })
  @BusinessColumn({
    label: "Ville du barreau",
    description: "Ville d'inscription au barreau",
    example: 'Paris, Douala, Dakar',
    importance: 'high',
    group: 'identification'
  })
  bar_association_city: string;

  @ApiProperty({ example: 5 })
  @Column({ name: 'years_of_experience', type: 'int', nullable: true })
  @BusinessColumn({
    label: "Années d'expérience",
    description: "Nombre d'années de pratique",
    unit: 'années',
    importance: 'high',
    group: 'compétences'
  })
  years_of_experience: number;

  @ApiProperty({ example: 150.00 })
  @Column({ name: 'hourly_rate', type: 'decimal', precision: 8, scale: 2, nullable: true })
  @BusinessColumn({
    label: 'Taux horaire',
    description: 'Tarif horaire facturé au client',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  hourly_rate: number;

  @ApiProperty({ example: true })
  @Column({ name: 'is_available', default: true })
  @BusinessColumn({
    label: 'Disponible',
    description: 'True = disponible pour de nouveaux dossiers',
    importance: 'high',
    group: 'disponibilité'
  })
  is_available: boolean;

  @ApiProperty({ example: 50 })
  @Column({ name: 'max_dossiers', type: 'int', default: 50 })
  @BusinessColumn({
    label: 'Capacité max',
    description: 'Nombre maximum de dossiers pouvant être gérés simultanément',
    unit: 'dossiers',
    importance: 'medium',
    group: 'charge'
  })
  max_dossiers: number;

  @ApiProperty({ example: 'Avocat spécialisé en droit commercial...' })
  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Biographie',
    description: 'Présentation professionnelle du collaborateur',
    importance: 'low',
    group: 'présentation'
  })
  bio: string;

  @ApiProperty({ example: ['Français', 'Anglais', 'Espagnol'] })
  @Column({ name: 'languages', type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Langues',
    description: 'Langues parlées par le collaborateur',
    example: 'Français, Anglais, Espagnol',
    importance: 'medium',
    group: 'compétences'
  })
  languages: string[];

  @ApiProperty({ example: ['Droit des sociétés', 'Contrats', 'Propriété intellectuelle'] })
  @Column({ name: 'expertise_areas', type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: "Domaines d'expertise",
    description: "Spécialités juridiques maîtrisées",
    example: 'Droit des sociétés, Contrats, Propriété intellectuelle',
    importance: 'high',
    group: 'compétences'
  })
  expertise_areas: string[];

  @ApiProperty({ example: 'EMP-2024-001' })
  @Column({ name: 'employee_number', length: 50, unique: true, nullable: true })
  @BusinessColumn({
    label: "Matricule",
    description: "Numéro unique d'identification du collaborateur",
    example: 'EMP-AVOC-2024-001',
    importance: 'high',
    group: 'identification'
  })
  employee_number: string;

  @ApiProperty({ example: '2024-01-01' })
  @Column({ name: 'birth_date', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date de naissance',
    description: 'Date de naissance du collaborateur',
    format: 'date',
    importance: 'medium',
    group: 'identification'
  })
  birth_date: Date;

  @ApiProperty({ example: '123 Rue du Palais, 75001 Paris' })
  @Column({ name: 'professional_address', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Adresse professionnelle',
    description: 'Adresse du cabinet ou bureau',
    importance: 'medium',
    group: 'coordonnées'
  })
  professional_address: string;

  @ApiProperty({ example: '+33 1 45 67 89 00' })
  @Column({ name: 'professional_phone', length: 20, nullable: true })
  @BusinessColumn({
    label: 'Téléphone professionnel',
    description: 'Numéro de téléphone du bureau',
    format: 'phone',
    importance: 'medium',
    group: 'coordonnées'
  })
  professional_phone: string;

  @ApiProperty({ example: 'MC123456789' })
  @Column({ name: 'siret_number', length: 14, nullable: true })
  @BusinessColumn({
    label: 'Numéro SIRET',
    description: "Numéro d'identification de l'entreprise",
    importance: 'low',
    group: 'administratif',
    ignored: true
  })
  siret_number: string;

  @ApiProperty({ example: 'FR12345678901' })
  @Column({ name: 'tva_number', length: 20, nullable: true })
  @BusinessColumn({
    label: 'Numéro de TVA',
    description: "Numéro d'identification à la TVA",
    importance: 'low',
    group: 'administratif',
    ignored: true
  })
  tva_number: string;

  // Relations
  @OneToMany(() => Dossier, (dossier) => dossier.lawyer)
  managed_dossiers: Dossier[];

  @ManyToMany(() => Dossier, dossier => dossier.collaborators)
  collaborating_dossiers: Dossier[];

  @OneToMany(() => Diligence, diligence => diligence.assigned_lawyer)
  assigned_diligences: Diligence[];

  // ==================== GETTERS MÉTIER ====================

  @BeforeInsert()
  setDefaultHireDate() {
    if (!this.hireDate) {
      this.hireDate = new Date();
    }
    if (!this.employee_number) {
      this.employee_number = this.generateEmployeeNumber();
    }
  }

  @Expose()
  @BusinessColumn({
    label: 'Nom complet',
    description: "Prénom et nom du collaborateur (depuis l'utilisateur associé)",
    importance: 'critical',
    group: 'identification'
  })
  get full_name(): string {
    return this.user?.full_name || '';
  }

  @Expose()
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email professionnelle',
    format: 'email',
    importance: 'high',
    group: 'coordonnées'
  })
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
  @BusinessColumn({
    label: 'Avocat',
    description: 'True si le collaborateur est avocat',
    importance: 'high',
    group: 'identification'
  })
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
  @BusinessColumn({
    label: 'Dossiers en cours',
    description: "Nombre de dossiers actuellement gérés",
    unit: 'dossiers',
    importance: 'high',
    group: 'charge'
  })
  get current_dossier_count(): number {
    return this.managed_dossiers?.filter(d => d.is_active).length || 0;
  }

  @Expose()
  @BusinessColumn({
    label: 'Peut accepter plus de dossiers',
    description: 'True si la capacité maximale de dossiers n\'est pas atteinte',
    importance: 'medium',
    group: 'charge'
  })
  get can_accept_more_dossiers(): boolean {
    return this.current_dossier_count < this.max_dossiers;
  }

  @Expose()
  get is_active(): boolean {
    return this.status === EmployeeStatus.ACTIVE;
  }

  @Expose()
  @BusinessColumn({
    label: "Niveau d'expérience",
    description: 'Débutant (<3 ans), Junior (3-8 ans), Confirmé (>8 ans), Senior',
    importance: 'medium',
    group: 'compétences'
  })
  get experience_level(): string {
    if (!this.years_of_experience) return 'Débutant';
    if (this.years_of_experience < 3) return 'Junior';
    if (this.years_of_experience < 8) return 'Confirmé';
    return 'Senior';
  }

  // ==================== MÉTHODES MÉTIER ====================

  private generateEmployeeNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const positionCode = this.position.substring(0, 3).toUpperCase();
    return `EMP-${positionCode}-${year}-${random}`;
  }

  canManageDossiers(): boolean {
    return this.is_avocat && this.is_active && this.can_accept_more_dossiers;
  }

  canValidateDocuments(): boolean {
    return this.is_avocat || this.position === EmployeePosition.HUISSIER;
  }

  getHourlyRateForClient(clientType: string): number {
    let rate = this.hourly_rate || 0;
    switch (clientType) {
      case 'particulier':
        rate *= 1.0;
        break;
      case 'professionnel':
        rate *= 1.2;
        break;
      case 'entreprise':
        rate *= 1.5;
        break;
    }
    return rate;
  }

  set email(value: string) {
    if (this.user) {
      this.user.email = value;
    }
  }
}