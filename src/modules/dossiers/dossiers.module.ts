import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';







import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { User } from '../iam/user/entities/user.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';
import { Dossier } from './entities/dossier.entity';








@Module({
  imports: [
    CoreModule,
    forwardRef(() => CustomerModule),
    forwardRef(() => DocumentsModule),

    TypeOrmModule.forFeature([Dossier,  User, ProcedureType]),
  ],
  controllers: [DossiersController],
  providers: [DossiersService],
  exports: [DossiersService, TypeOrmModule],
})
export class DossiersModule {}
