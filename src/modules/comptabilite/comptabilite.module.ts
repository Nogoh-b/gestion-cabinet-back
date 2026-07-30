import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompteComptable }   from './entities/compte.entity';
import { JournalComptable }  from './entities/journal.entity';
import { ExerciceComptable } from './entities/exercice.entity';
import { Ecriture }          from './entities/ecriture.entity';
import { LigneEcriture }     from './entities/ligne-ecriture.entity';

// Entités métier existantes — enregistrées ici en LECTURE SEULE,
// uniquement pour la synchronisation initiale (backfill de l'historique).
import { Facture }         from '../facture/entities/facture.entity';
import { Paiement }        from '../paiement/entities/paiement.entity';
import { SupplierInvoice } from '../supplier/entities/supplier-invoice.entity';
import { ExpenseReport }   from '../supplier/entities/expense-report.entity';
import { Payslip }         from '../payroll/entities/payslip.entity';

import { EcrituresService }       from './services/ecritures.service';
import { ComptesService }         from './services/comptes.service';
import { ExercicesService }       from './services/exercices.service';
import { RapportsService }        from './services/rapports.service';
import { ComptabilisationService }from './services/comptabilisation.service';
import { SynchronisationService } from './services/synchronisation.service';
import { InitialisationComptableService } from './services/initialisation.service';

import { ComptabiliteEventBridge } from './bridge/comptabilite-event.bridge';

import { EcrituresController }      from './controllers/ecritures.controller';
import { ComptesController }        from './controllers/comptes.controller';
import { ExercicesController }      from './controllers/exercices.controller';
import { RapportsController }       from './controllers/rapports.controller';
import { SynchronisationController }from './controllers/synchronisation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Entités comptables
      CompteComptable,
      JournalComptable,
      ExerciceComptable,
      Ecriture,
      LigneEcriture,
      // Entités métier (lecture seule, pour le backfill)
      Facture,
      Paiement,
      SupplierInvoice,
      ExpenseReport,
      Payslip,
    ]),
  ],
  controllers: [
    EcrituresController,
    ComptesController,
    ExercicesController,
    RapportsController,
    SynchronisationController,
  ],
  providers: [
    EcrituresService,
    ComptesService,
    ExercicesService,
    RapportsService,
    ComptabilisationService,
    SynchronisationService,
    InitialisationComptableService,
    ComptabiliteEventBridge,
  ],
  exports: [EcrituresService],
})
export class ComptabiliteModule {}
