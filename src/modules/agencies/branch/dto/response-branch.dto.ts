import { Expose, Transform } from 'class-transformer';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Employee } from '../../employee/entities/employee.entity';

export class BranchResponseDto {
  /* ------------------ META ------------------ */
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty({ example: 'BR-001' })
  @Expose()
  code: string;

  @ApiProperty({ example: 'Agence Principale' })
  @Expose()
  name: string;

  /* ------------------ LOCALISATION ------------------ */
  @ApiProperty({ example: 1 })
  @Expose()
  location_city_id: number;

  @ApiProperty({ type: () => LocationCity })
  @Expose()
  location_city?: LocationCity;

  @ApiProperty({ example: 'Douala', description: 'Nom de la ville' })
  @Expose()
  @Transform(({ obj }) => obj.location_city?.name || null)
  city_name: string;

  @ApiProperty({ example: 'Wouri', description: 'Nom du district' })
  @Expose()
  @Transform(({ obj }) => obj.location_city?.district?.name || null)
  district_name: string;

  @ApiProperty({ example: 'Littoral', description: 'Nom de la région' })
  @Expose()
  @Transform(({ obj }) => obj.location_city?.district?.division?.region?.name || null)
  region_name: string;

  @ApiProperty({ example: 'Cameroun', description: 'Nom du pays' })
  @Expose()
  @Transform(({ obj }) => obj.location_city?.district?.division?.region?.country?.name || null)
  country_name: string;

  @ApiProperty({ 
    example: 'Douala, Wouri, Littoral, Cameroun',
    description: 'Adresse complète formatée' 
  })
  @Expose()
  @Transform(({ obj }) => obj.location_city?.full_address || '')
  full_address: string;

  @ApiProperty({ 
    example: 'Douala, Littoral, Cameroun',
    description: 'Résumé de localisation' 
  })
  @Expose()

  location_summary: string;

  /* ------------------ HORAIRES ------------------ */
  @ApiProperty({ example: '2025-07-09T02:02:56.000Z' })
  @Expose()
  creation_date: Date;

  @ApiProperty({ example: "08:00", description: "Heure d'ouverture (format HH:MM)" })
  @Expose()
  opening_hour: string;  // ← CORRIGÉ : string au lieu de number

  @ApiProperty({ example: "17:00", description: "Heure de fermeture (format HH:MM)" })
  @Expose()
  closing_hour: string;  // ← CORRIGÉ : string au lieu de number

  @ApiProperty({ example: '08:00 - 17:00', description: 'Horaires formatés' })
  @Expose()
  @Transform(({ obj }) => `${obj.opening_hour} - ${obj.closing_hour}`)
  operating_hours_formatted: string;

  @ApiProperty({ example: '08:00 - 17:00', description: 'Horaires formatés (alternative)' })
  @Expose()
  @Transform(({ obj }) => `${obj.opening_hour}:00 - ${obj.closing_hour}:00`)
  operating_hours: string;

  @ApiProperty({ example: true, description: "Est-ce que l'agence est ouverte maintenant" })
  @Expose()
  is_open_now: boolean;

  /* ------------------ STATISTIQUES ------------------ */
  @ApiProperty({ example: 5, description: "Nombre d'employés" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.length || 0)
  employee_count: number;

  @ApiProperty({ example: 3, description: "Nombre d'employés actifs" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.filter(emp => emp.status === 1).length || 0)
  active_employee_count: number;

  @ApiProperty({ example: 2, description: "Nombre d'avocats" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.filter(emp => emp.position === 'avocat').length || 0)
  avocat_count: number;

  @ApiProperty({ example: 1, description: "Nombre de secrétaires" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.filter(emp => emp.position === 'secretaire').length || 0)
  secretaire_count: number;

  @ApiProperty({ example: 120, description: 'Nombre de clients' })
  @Expose()
  @Transform(({ obj }) => obj.customers?.length || 0)
  customer_count: number;

  @ApiProperty({ type: () => [Employee], description: "Liste des avocats" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.filter(emp => emp.position === 'avocat') || [])
  avocats: Employee[];

  @ApiProperty({ type: () => [Employee], description: "Liste des secrétaires" })
  @Expose()
  @Transform(({ obj }) => obj.employees?.filter(emp => emp.position === 'secretaire') || [])
  secretaires: Employee[];

  @ApiProperty({ example: 'BR-001 - Agence Principale', description: 'Nom formaté' })
  @Expose()
  @Transform(({ obj }) => `${obj.code} - ${obj.name}`)
  display_name: string;

  /* ------------------ STATUT ------------------ */
  @ApiProperty({ example: 1 })
  @Expose()
  status: number;

  @ApiProperty({ example: true, description: "Si l'agence est active" })
  @Expose()
  @Transform(({ obj }) => obj.status === 1)
  is_active: boolean;

  /* ------------------ AUDIT ------------------ */
  @ApiProperty({ example: '2025-11-18T17:45:02.121Z' })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: '2025-11-18T17:45:02.133Z' })
  @Expose()
  updated_at: Date;

  @ApiProperty({ example: null, nullable: true })
  @Expose()
  deleted_at: Date | null;
}