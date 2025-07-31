import { Module } from '@nestjs/common';



import { TypeOrmModule } from '@nestjs/typeorm';


import { RessourceTypeModule } from './ressource-type/ressource-type.module';
import { Ressource } from './ressource/entities/ressource.entity';
import { RessourceController } from './ressource/ressource.controller';
import { RessourceService } from './ressource/ressource.service';





@Module({
  
  imports: [TypeOrmModule.forFeature([ 
    Ressource
  ]), RessourceTypeModule],
  controllers: [RessourceController],
  providers: [RessourceService],
  exports: [RessourceService],
})
export class RessourceModule {}
