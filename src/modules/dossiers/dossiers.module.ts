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
import { ChatModule } from '../chat/chat.module';
import { DossierStatsService } from './dossier-stats.service';
import { StepModule } from '../step/step.module';








@Module({
  imports: [
    forwardRef(() => CoreModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => ChatModule),
    forwardRef(() => StepModule),

    TypeOrmModule.forFeature([Dossier,  User, ProcedureType]),
  ],
  controllers: [DossiersController],
  providers: [DossiersService,DossierStatsService, ],
  exports: [DossiersService, DossierStatsService, TypeOrmModule],
})
export class DossiersModule {}
