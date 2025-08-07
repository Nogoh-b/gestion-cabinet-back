import { Module } from '@nestjs/common';

import { PersonnelModule as PersonnelFeatureModule } from './personnel/personnel.module';
import { TypePersonnelSeeder } from './type_personnel/seed-type-personnel';
import { TypePersonnelModule } from './type_personnel/type_personnel.module';

@Module({
  imports: [TypePersonnelModule, PersonnelFeatureModule],
  controllers: [],
  providers: [TypePersonnelSeeder],
  exports: [TypePersonnelModule, PersonnelFeatureModule,TypePersonnelSeeder],
})
export class PersonnelModule {}
