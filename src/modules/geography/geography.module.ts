import { Module } from '@nestjs/common';
import { RegionController } from './region/region.controller';
import { DivisionsController } from './divivion/divivion.controller';
import { DistrictsController } from './district/district.controller';
import { LocationCitiesController } from './location_city/location_city.controller';
import { CountriesController } from './country/country.controller';
import { RegionsService } from './region/region.service';
import { DivisionsService } from './divivion/divivion.service';
import { DistrictsService } from './district/district.service';
import { CountriesService } from './country/country.service';
import { LocationCitiesService } from './location_city/location_city.service';
import { Region } from './region/entities/region.entity';
import { LocationCity } from './location_city/entities/location_city.entity';
import { District } from './district/entities/district.entity';
import { Division } from './divivion/entities/divivion.entity';
import { Country } from './country/entities/country.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { UsersService } from '../iam/user/user.service';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Region,LocationCity,District,Division,Country]),
    CoreModule,
    IamModule
  ],
  controllers: [
    RegionController,
    DivisionsController,
    DistrictsController,
    LocationCitiesController,
    CountriesController,
  ],
  providers: [
    RegionsService,
    DivisionsService,
    DistrictsService,
    LocationCitiesService,
    CountriesService,
    UsersService
  
  ],
  exports: [
    RegionsService,
    DivisionsService,
    DistrictsService,
    LocationCitiesService,
    CountriesService,
    TypeOrmModule
  ],
})
export class GeographyModule {}
