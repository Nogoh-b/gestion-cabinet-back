import { Module } from '@nestjs/common';
import { RessourceModule } from './ressource/ressource.module';
import { RessourceTypeModule } from './ressource-type/ressource-type.module';

@Module({
  imports: [RessourceModule, RessourceTypeModule]
})
export class RessourceModule {}
