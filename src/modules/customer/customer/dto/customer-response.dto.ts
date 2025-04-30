// customer-response.dto.ts
import { Expose, Transform } from 'class-transformer';

export class CustomerResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose({ name: 'first_name' })
  firstName: string;

  @Expose({ name: 'public_key' })
  publicKey: string;

  @Expose({ name: 'private_key' })
  privateKey: string;

  @Expose({ name: 'number_phone_1' })
  numberPhone1: string;

  @Expose({ name: 'number_phone_2' })
  numberPhone2: string;

  @Expose()
  email: string;

  @Expose({ name: 'type_customer_id' })
  @Transform(({ obj }) => obj.typeCustomer?.id)
  typeCustomerId: number;

  @Expose({ name: 'location_city_id' })
  @Transform(({ obj }) => obj.locationCity?.id)
  locationCityId: number;

  @Expose()
  nui: string;

  @Expose()
  rccm: string;

  @Expose()
  birthday: Date;

  @Expose({ name: 'created_at' })
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  updatedAt: Date;

  @Expose()
  status: number;
}