import { Exclude, Expose, Transform } from 'class-transformer';
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
  @Exclude()
  location_city?: LocationCity;

  // Informations de localisation exposées directement
  @ApiProperty({ example: 'Douala', description: 'Nom de la ville' })
  @Expose()
  // @Transform(({ obj }) => obj.location_city?.name || null)
  city_name: string;

  @ApiProperty({ example: 'Wouri', description: 'Nom du district' })
  @Expose()
  // @Transform(({ obj }) => obj.location_city?.district?.name || null)
  district_name: string;

  @ApiProperty({ example: 'Littoral', description: 'Nom de la région' })
  @Expose()
  // @Transform(({ obj }) => obj.location_city?.district?.division?.region?.name || null)
  region_name: string;

  @ApiProperty({ example: 'Cameroun', description: 'Nom du pays' })
  @Expose()
  // @Transform(({ obj }) => obj.location_city?.district?.division?.region?.country?.name || null)
  country_name: string;

  @ApiProperty({ 
    example: 'Douala, Wouri, Littoral, Cameroun',
    description: 'Adresse complète formatée' 
  })
  @Expose()

  full_address: string;

  /* ------------------ HORAIRES ------------------ */
  @ApiProperty({ example: '2025-07-09T02:02:56.000Z' })
  @Expose()
  creation_date: Date;

  @ApiProperty({ example: 8 })
  @Expose()
  opening_hour: number;

  @ApiProperty({ example: 17 })
  @Expose()
  closing_hour: number;

  @ApiProperty({ example: '8:00 - 17:00', description: 'Horaires formatés' })
  @Expose()
  @Transform(({ obj }) => `${obj.opening_hour}:00 - ${obj.closing_hour}:00`)
  operating_hours: string;

  @ApiProperty({ example: true, description: "Est-ce que l'agence est ouverte maintenant" })
  @Expose()
  @Transform(({ obj }) => {
    const now = new Date();
    const currentHour = now.getHours();
    return currentHour >= obj.opening_hour && currentHour < obj.closing_hour;
  })
  is_open_now: boolean;

  @ApiProperty({ example: 5, description: "Nombre d'employés" })
  // @Exclude()
  @Transform(({ obj }) => obj.employees)

  avocats: Employee[];

  /* ------------------ STATISTIQUES ------------------ */
  @ApiProperty({ example: 5, description: "Nombre d'employés" })
  employees_count: number;

  @ApiProperty({ example: 3, description: "Nombre d'employés actifs" })
  @Expose()
  active_employees_count: number;

  @ApiProperty({ example: 2, description: "Nombre d'avocats" })
  @Expose()
  avocats_count: number;

  @Expose()
  customers_count: number;

  @ApiProperty({ example: 120, description: 'Nombre de clients' })
  @Exclude()
  customers: any;

  @ApiProperty({ example: 'BR-001 - Agence Principale', description: 'Nom formaté' })
  @Expose()
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