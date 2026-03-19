import { Module } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { ProceduresController } from './procedures.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerModule } from '../customer/customer.module';
import { ProcedureType } from './entities/procedure.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DossiersModule } from '../dossiers/dossiers.module';
import { ProcedureStatsService } from './procedure-stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcedureType, Dossier]), // ✅ les deux entités ici
    CustomerModule,
    DossiersModule
  ],
  controllers: [ProceduresController],
  providers: [ProceduresService, ProcedureStatsService],
  exports: [ProceduresService, ProcedureStatsService],
})
export class ProceduresModule {}
