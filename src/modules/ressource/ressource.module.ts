import { Module } from '@nestjs/common';

import { RessourceTypeModule } from './ressource-type/ressource-type.module';

@Module({
  imports: [ RessourceTypeModule]
})
export class RessourceModule {}
