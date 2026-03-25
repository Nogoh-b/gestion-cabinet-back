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
import { StepsService } from './step.service';
import { Step } from './entities/step.entity';
import { AudiencesModule } from '../audiences/audiences.module';
import { DiligenceModule } from '../diligence/diligence.module';
import { FactureModule } from '../facture/facture.module';








@Module({
  imports: [
    forwardRef(() => CustomerModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => ChatModule),
    forwardRef(() => AudiencesModule),
    forwardRef(() => DiligenceModule),
    forwardRef(() => FactureModule),

    TypeOrmModule.forFeature([Dossier,  User, ProcedureType, Step]),
  ],
  controllers: [DossiersController],
  providers: [DossiersService,DossierStatsService, StepsService ],
  exports: [DossiersService, DossierStatsService, TypeOrmModule, StepsService],
})
export class DossiersModule {}
