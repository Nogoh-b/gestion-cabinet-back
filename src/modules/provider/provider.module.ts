import { Module } from '@nestjs/common';
import { ProviderController } from './provider/provider.controller';
import { ProviderService } from './provider/provider.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './provider/entities/provider.entity';
import { GeographyModule } from '../geography/geography.module';

@Module({
  imports:[
    TypeOrmModule.forFeature([
      Provider
    ]),
    GeographyModule
  ],
  
  controllers: [ProviderController],
  providers:[ProviderService]
})
export class ProviderModule {}
