import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';



import { Ressource } from '../ressource/entities/ressource.entity';
import { RessourceType } from './entities/ressource-type.entity';
import { RessourceTypeController } from './ressource-type.controller';
import { RessourceTypeService } from './ressource-type.service';





@Module({
  imports: [TypeOrmModule.forFeature([ 
    RessourceType,
    Ressource
  ]),
  RessourceTypeModule],
  controllers: [RessourceTypeController],
  providers: [RessourceTypeService],
  exports: [RessourceTypeService],
})
export class RessourceTypeModule {}
