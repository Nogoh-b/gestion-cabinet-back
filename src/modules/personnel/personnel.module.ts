import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { IamModule } from '../iam/iam.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Personnel } from './personnel/entities/personnel.entity';
import { PersonnelController } from './personnel/personnel.controller';
import { PersonnelService } from './personnel/personnel.service';
import { TypePersonnel } from './type_personnel/entities/type_personnel.entity';
import { TypePersonnelSeeder } from './type_personnel/seed-type-personnel';
import { TypePersonnelController } from './type_personnel/type_personnel.controller';
import { TypePersonnelService } from './type_personnel/type_personnel.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([TypePersonnel, Personnel]),
      forwardRef(() => SavingsAccountModule),
      forwardRef(() => CustomerModule),
      forwardRef(() => DocumentsModule),
      forwardRef(() => CoreModule),
      forwardRef(() => TransactionModule),
      forwardRef(() => IamModule),
    
  ],
  controllers: [TypePersonnelController, PersonnelController],
  providers: [TypePersonnelSeeder, TypePersonnelService, PersonnelService],
  exports: [TypePersonnelService, PersonnelService,TypePersonnelSeeder],
})
export class PersonnelModule {}
