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

// Dépendances externes

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
  ],
  controllers: [
    DossierReferralsController,
    ReferralCommissionsController,
    ReferrersController,
  ],
  providers: [
    DossierReferralsService,
    ReferralCommissionsService,
    ReferrersService

  ],
  exports: [
    DossierReferralsService,
    ReferralCommissionsService,
    ReferrersService

  ],
})
export class ReferralModule {}