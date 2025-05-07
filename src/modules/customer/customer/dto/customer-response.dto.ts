// customer-response.dto.ts
import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CustomerResponseDto {
  @Expose()
  @ApiProperty()
  id: number;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  customer_code: string;

  @Expose({ name: 'first_name' })
  @ApiProperty()
  first_name: string;

  @Expose({ name: 'public_key' })
  @ApiProperty()
  public_key: string;

  @Expose({ name: 'private_key' })
  @ApiProperty()
  private_key: string;

  @Expose({ name: 'number_phone_1' })
  @ApiProperty()
  number_phone_1: string;

  @Expose({ name: 'number_phone_2' })
  @ApiProperty()
  number_phone_2: string;

  @Expose()
  @ApiProperty()
  email: string;

 /* @Expose({ name: 'type_customer_id' })
  @Transform(({ obj }) => obj.typeCustomer?.id)
  typeCustomerId: number;*/

  /*@Expose({ name: 'type_customer_id' })
  @Transform(({ obj }) => obj.typeCustomer)
  type_customer: TypeCustomer;

  @Expose({ name: 'location_city_id' })
  @Transform(({ obj }) => obj.locationCity)
  location_city: LocationCity;*/

  @Expose()
  nui: string;

  @Expose()
  rccm: string;

  @Expose()
  birthday: Date;

  @Expose({ name: 'created_at' })
  create_at: Date;

  @Expose({ name: 'updated_at' })
  update_at: Date;

  @Expose()
  status: number;
}