import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';




import { TypePersonnel } from './entities/type_personnel.entity';
import { TypePersonnelController } from './type_personnel.controller';
import { TypePersonnelService } from './type_personnel.service';






@Module({
    imports: [TypeOrmModule.forFeature([TypePersonnel])],
  controllers: [TypePersonnelController],
  providers: [TypePersonnelService],
  exports: [TypePersonnelService, TypeOrmModule],
})
export class TypePersonnelModule {}
