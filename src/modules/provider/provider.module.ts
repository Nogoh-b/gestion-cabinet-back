import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GeographyModule } from '../geography/geography.module';
import { Provider } from './provider/entities/provider.entity';
import { ProviderController } from './provider/provider.controller';
import { ProviderSeeder } from './provider/provider.seeder';
import { ProviderService } from './provider/provider.service';


@Module({
  imports:[
    TypeOrmModule.forFeature([
      Provider
    ]),
    GeographyModule
  ],
  
  controllers: [ProviderController],
  providers:[ProviderService, ProviderSeeder],
  exports:[ProviderService, ProviderSeeder]
})
export class ProviderModule {}
