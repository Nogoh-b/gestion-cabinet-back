// create-location-city.dto.ts
import { Expose, Transform } from 'class-transformer';
import { IsString, IsOptional } from 'class-validator';
import { CreateCustomerDto } from 'src/modules/customer/customer/dto/create-customer.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { District } from '../../district/entities/district.entity';









export class ResponseLocationCityDto  extends PartialType(CreateCustomerDto) {
  @Expose()
  @IsString()
  @ApiProperty()
  @IsOptional()
  name?: string;

  @Expose()
  district?: District;

  @Expose()
  @Transform(({ obj }) => {
    return [
      obj.name,
      obj.district?.name,
      obj.district?.division?.name,
      obj.district?.division?.region?.name,
      obj.district?.division?.region?.country?.name
    ].filter(Boolean).join(', ');
  })
  @ApiProperty()
  fullAddress: string;
}
