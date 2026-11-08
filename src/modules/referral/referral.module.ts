import { Module, OnModuleInit } from '@nestjs/common';
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
import { DossiersModule } from '../dossiers/dossiers.module';
import { ReferrersService } from './referral.service';
import { ReferrersController } from './referral.controller';
import { ReferralCommissionListener } from './referral-commission.listener';
import { ReferrerWriteHandler } from './referrer-write.handler';
import { User } from '../iam/user/entities/user.entity';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Referrer,
      DossierReferral,
      ReferralCommission,
      User,
    ]),
    AiDatabaseModule,
    AgenciesModule,
    CustomerModule,
    DossiersModule,
    FactureModule,
    PaiementModule,
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
    ReferralCommissionListener,
    ReferrerWriteHandler,
  ],
  exports: [
    DossierReferralsService,
    ReferralCommissionsService,
    ReferrersService,
  ],
})
export class ReferralModule implements OnModuleInit {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: ReferrerWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}
