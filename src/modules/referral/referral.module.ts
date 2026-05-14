import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { DossierReferral } from './entities/dossier-referral.entity';
import { ReferralCommission } from './entities/referral-commission.entity';

// Services
import { DossierReferralsService } from './dossier-referrals.service';
import { ReferralCommissionsService } from './referral-commissions.service';

// Controllers
import { DossierReferralsController } from './dossier-referrals.controller';
import { ReferralCommissionsController } from './referral-commissions.controller';
import { Referrer } from './entities/referral.entity';
import { AgenciesModule } from '../agencies/agencies.module';
import { FactureModule } from '../facture/facture.module';
import { PaiementModule } from '../paiement/paiement.module';
import { CustomerModule } from '../customer/customer.module';
import { ReferrersService } from './referral.service';
import { ReferrersController } from './referral.controller';
import { DossierReferralWriteHandler } from './dossier-referral-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Referrer,
      DossierReferral,
      ReferralCommission,
    ]),
    AgenciesModule,
    CustomerModule,
    FactureModule,
    PaiementModule,
    AiDatabaseModule,
  ],
  controllers: [
    DossierReferralsController,
    ReferralCommissionsController,
    ReferrersController,
  ],
  providers: [
    DossierReferralsService,
    ReferralCommissionsService,
    ReferrersService,
    DossierReferralWriteHandler,
  ],
  exports: [
    DossierReferralsService,
    ReferralCommissionsService,
    ReferrersService,
  ],
})
export class ReferralModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: DossierReferralWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}