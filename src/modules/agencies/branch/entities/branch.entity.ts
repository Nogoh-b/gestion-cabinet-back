/* eslint-disable prettier/prettier */
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Entity, OneToMany, BeforeInsert } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Employee } from '../../employee/entities/employee.entity';
import { Expose } from 'class-transformer';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('branch')
@BusinessTable({
  label: 'Agences / Succursales',
  description: 'Gestion des agences et succursales du cabinet. Une agence est un lieu physique où travaillent des avocats et collaborateurs, et où sont reçus les clients.',
  icon: '🏢',
  category: 'organisation'
})
export class Branch extends BaseEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @ApiProperty({ example: 'BR-001' })
  @Column({ length: 10, unique: true })
  @BusinessColumn({
    label: 'Code agence',
    description: 'Code unique identifiant l\'agence (format: BR-XXX). Utilisé pour la recherche rapide.',
    example: 'BR-001',
    importance: 'critical',
    group: 'identification'
  })
  code: string;

  @ApiProperty({ example: 'Agence Principale' })
  @Column({ length: 100 })
  @BusinessColumn({
    label: 'Nom de l\'agence',
    description: 'Nom commercial de l\'agence ou succursale',
    example: 'Agence Principale de Douala',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ name: 'location_city_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Ville',
    description: 'Identifiant de la ville où se situe l\'agence',
    importance: 'high',
    group: 'localisation',
    ignored: true  // Relation gérée par location_city
  })
  location_city_id: number;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  @BusinessColumn({
    label: 'Localisation',
    description: 'Ville et adresse complète de l\'agence',
    importance: 'high',
    group: 'localisation'
  })
  location_city: LocationCity;

  @ApiProperty({ example: '2023-01-01' })
  @Column({
    type: 'timestamp',
    name: 'creation_date',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date d\'ouverture de l\'agence',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  creation_date: Date;

  @ApiProperty({ example: '08:00' })
  @Column({ type: 'text', name: 'opening_hour' })
  @BusinessColumn({
    label: 'Heure d\'ouverture',
    description: 'Heure d\'ouverture quotidienne (format HH:MM)',
    example: '08:00',
    importance: 'medium',
    group: 'horaires'
  })
  opening_hour: string;

  @ApiProperty({ example: '18:00' })
  @Column({ type: 'text', name: 'closing_hour' })
  @BusinessColumn({
    label: 'Heure de fermeture',
    description: 'Heure de fermeture quotidienne (format HH:MM)',
    example: '18:00',
    importance: 'medium',
    group: 'horaires'
  })
  closing_hour: string;

  @OneToMany(() => Employee, (employee) => employee.branch)
  employees: Employee[];

  @OneToMany(() => Customer, (c) => c.branch)
  customers: Customer[];

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint', default: 1 })
  @BusinessColumn({
    label: 'Statut',
    description: '1 = Actif, 0 = Inactif',
    example: '1 = Actif',
    importance: 'high',
    group: 'état'
  })
  status: number;

  // =========== GETTERS MÉTIER PERTINENTS ===========

  @Expose()
  get full_address(): string {
    return this.location_city?.full_address || '';
  }

  @Expose()
  @BusinessColumn({
    label: 'Adresse complète',
    description: 'Adresse postale complète de l\'agence',
    importance: 'high',
    group: 'localisation'
  })
  get address(): string {
    return this.full_address;
  }

  @Expose()
  get city_name(): string {
    return this.location_city?.name || '';
  }

  @Expose()
  @BusinessColumn({
    label: 'Ville',
    description: 'Nom de la ville où se situe l\'agence',
    importance: 'high',
    group: 'localisation'
  })
  get city(): string {
    return this.city_name;
  }

  @Expose()
  get district_name(): string {
    return this.location_city?.district?.name || '';
  }

  @Expose()
  get region_name(): string {
    return this.location_city?.district?.division?.region?.name || '';
  }

  @Expose()
  get country_name(): string {
    return this.location_city?.district?.division?.region?.country?.name || '';
  }

  @Expose()
  @BusinessColumn({
    label: 'Pays',
    description: 'Pays où se situe l\'agence',
    importance: 'medium',
    group: 'localisation'
  })
  get country(): string {
    return this.country_name;
  }

  @Expose()
  @BusinessColumn({
    label: 'Ouvert actuellement',
    description: 'True = l\'agence est ouverte à l\'heure actuelle, False = fermée',
    importance: 'high',
    group: 'horaires'
  })
  get is_open_now(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    const [openHour, openMinute] = this.opening_hour.split(':').map(Number);
    const [closeHour, closeMinute] = this.closing_hour.split(':').map(Number);
    
    const currentTotal = currentHour * 60 + currentMinutes;
    const openTotal = openHour * 60 + openMinute;
    const closeTotal = closeHour * 60 + closeMinute;
    
    return currentTotal >= openTotal && currentTotal < closeTotal;
  }

  @Expose()
  @BusinessColumn({
    label: 'Horaires',
    description: 'Plage horaire d\'ouverture (HH:MM - HH:MM)',
    example: '08:00 - 18:00',
    importance: 'medium',
    group: 'horaires'
  })
  get operating_hours_formatted(): string {
    return `${this.opening_hour} - ${this.closing_hour}`;
  }

  @Expose()
  @BusinessColumn({
    label: "Nombre d'employés",
    description: 'Nombre total d\'employés dans l\'agence',
    importance: 'medium',
    group: 'ressources'
  })
  get employee_count(): number {
    return this.employees?.length || 0;
  }

  @Expose()
  @BusinessColumn({
    label: 'Employés actifs',
    description: "Nombre d'employés actifs dans l'agence",
    importance: 'medium',
    group: 'ressources'
  })
  get active_employee_count(): number {
    return this.employees?.filter(emp => emp.status === 1).length || 0;
  }

  @Expose()
  @BusinessColumn({
    label: "Nombre de clients",
    description: "Nombre de clients rattachés à l'agence",
    importance: 'medium',
    group: 'ressources'
  })
  get customer_count(): number {
    return this.customers?.length || 0;
  }

  @Expose()
  @BusinessColumn({
    label: "Nombre d'avocats",
    description: "Nombre d'avocats travaillant dans l'agence",
    importance: 'medium',
    group: 'ressources'
  })
  get avocat_count(): number {
    return this.employees?.filter(emp => emp.position === 'avocat').length || 0;
  }

  @Expose()
  @BusinessColumn({
    label: "Nombre de secrétaires",
    description: "Nombre de secrétaires travaillant dans l'agence",
    importance: 'low',
    group: 'ressources'
  })
  get secretaire_count(): number {
    return this.employees?.filter(emp => emp.position === 'secretaire').length || 0;
  }

  @Expose()
  get is_active(): boolean {
    return this.status === 1;
  }

  @Expose()
  @BusinessColumn({
    label: 'Nom affiché',
    description: 'Code et nom de l\'agence combinés',
    example: 'BR-001 - Agence Principale',
    importance: 'medium',
    group: 'identification'
  })
  get display_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @Expose()
  @BusinessColumn({
    label: 'Résumé localisation',
    description: 'Ville, région et pays combinés',
    example: 'Douala, Littoral, Cameroun',
    importance: 'medium',
    group: 'localisation'
  })
  get location_summary(): string {
    const parts: any[] = [];
    if (this.city_name) parts.push(this.city_name);
    if (this.region_name) parts.push(this.region_name);
    if (this.country_name) parts.push(this.country_name);
    return parts.join(', ') || 'Localisation non définie';
  }

  @Expose()
  get employees_count(): number {
    return this.employees?.length || 0;
  }

  @Expose()
  get active_employees_count(): number {
    return this.employees?.filter(emp => emp.status === 1).length || 0;
  }

  @Expose()
  get avocats_count(): number {
    return this.employees?.filter(emp => emp.position === 'avocat').length || 0;
  }

  @Expose()
  get customers_count(): number {
    return this.customers?.length || 0;
  }

  @Expose()
  get operating_hours(): string {
    return `${this.opening_hour}:00 - ${this.closing_hour}:00`;
  }

  // =========== MÉTHODES MÉTIER ===========

  isOpenAt(hour: number): boolean {
    const openHour = parseInt(this.opening_hour.split(':')[0], 10);
    const closeHour = parseInt(this.closing_hour.split(':')[0], 10);
    return hour >= openHour && hour < closeHour;
  }

  getEmployeesByPosition(position: string): Employee[] {
    return this.employees?.filter(emp => emp.position === position) || [];
  }

  @BeforeInsert()
  async generateCode() {
    // Code généré automatiquement
  }

  async setStatus(status: number): Promise<void> {
    this.status = status ?? 1;
    await this.save();
  }
}