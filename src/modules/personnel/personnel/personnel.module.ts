import { CustomerModule } from 'src/modules/customer/customer.module';
import { SavingsAccountModule } from 'src/modules/savings-account/savings-account.module';

import { forwardRef, Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';




import { TypePersonnelModule } from '../type_personnel/type_personnel.module';
import { Personnel } from './entities/personnel.entity';
import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';







@Module({
  imports: [TypeOrmModule.forFeature([Personnel]), 
  forwardRef(() => SavingsAccountModule),
  forwardRef(() => CustomerModule),
  TypePersonnelModule],
  controllers: [PersonnelController],
  providers: [PersonnelService],
  exports: [PersonnelService, TypeOrmModule],
})
export class PersonnelModule {}
