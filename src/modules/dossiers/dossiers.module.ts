import { Module } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { DossiersController } from './dossiers.controller';
import { Dossier } from './entities/dossier.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../iam/user/entities/user.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { CustomerModule } from '../customer/customer.module';
import { CoreModule } from 'src/core/core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dossier,  User, ProcedureType]),
    CustomerModule,
    CoreModule
  ],
  controllers: [DossiersController],
  providers: [DossiersService],
  exports: [DossiersService, TypeOrmModule],
})
export class DossiersModule {}
