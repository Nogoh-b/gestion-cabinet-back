import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';


import { CountriesController } from './country/country.controller';
import { CountriesService } from './country/country.service';
import { Country } from './country/entities/country.entity';
import { DistrictsController } from './district/district.controller';
import { DistrictsService } from './district/district.service';
import { District } from './district/entities/district.entity';
import { DivisionsController } from './divivion/divivion.controller';
import { DivisionsService } from './divivion/divivion.service';
import { Division } from './divivion/entities/divivion.entity';
import { LocationCity } from './location_city/entities/location_city.entity';
import { LocationCitiesController } from './location_city/location_city.controller';
import { LocationCitiesService } from './location_city/location_city.service';
import { Region } from './region/entities/region.entity';
import { RegionController } from './region/region.controller';
import { RegionsService } from './region/region.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([Region,LocationCity,District,Division,Country]),
    forwardRef(() => CoreModule),  // <-- UTILISEZ forwardRef ICI
    // IamModule,
    // forwardRef(() => AgenciesModule), 

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
