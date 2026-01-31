import { Expose, Transform } from 'class-transformer';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';

import { ApiProperty } from '@nestjs/swagger';





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

  /* ------------------ RELATIONS ------------------ */

  // @ApiProperty({
  //   type: () => [EmployeeResponseDto],
  //   description: 'Liste des employés de l’agence',
  // })
  // @Expose()
  // employees?: EmployeeResponseDto[];

  // @ApiProperty({
  //   type: () => [CustomerResponseDto],
  //   description: 'Clients rattachés à l’agence',
  // })
  // @Expose()
  // customers?: CustomerResponseDto[];

  /* ------------------ STATUT ------------------ */

  @ApiProperty({ example: 1 })
  @Expose()
  status: number;

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


   @ApiProperty({
    example: 5,
    description: "Nombre d'employés",
  })
  @Expose()
  @Transform(({ obj }) => obj.employees?.length ?? 0)
  employees_count: number;

  @ApiProperty({
    example: 120,
    description: 'Nombre de clients',
  })
  @Expose()
  @Transform(({ obj }) => obj.customers?.length ?? 0)
  customers_count: number;

}
