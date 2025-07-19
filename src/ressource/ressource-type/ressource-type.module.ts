import { Module } from '@nestjs/common';
import { RessourceTypeService } from './ressource-type.service';
import { RessourceTypeController } from './ressource-type.controller';

@Module({
  controllers: [RessourceTypeController],
  providers: [RessourceTypeService],
})
export class RessourceTypeModule {}
