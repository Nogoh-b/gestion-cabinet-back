import { CoreModule } from 'src/core/core.module';

import { forwardRef, Module } from '@nestjs/common';




import { TypeOrmModule } from '@nestjs/typeorm';




import { CustomerModule } from '../customer/customer.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { Partner } from './entities/partner.entity';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { TransactionModule } from '../transaction/transaction.module';
import { DocumentsModule } from '../documents/documents.module';










@Module({
  controllers: [PartnerController],
  providers: [PartnerService],
  exports: [PartnerService],
  imports: [    
      forwardRef(() => CustomerModule),
      CoreModule,
      forwardRef(() => SavingsAccountModule),
      forwardRef(() => TransactionModule),
      forwardRef(() => DocumentsModule),
      
    TypeOrmModule.forFeature([
        Partner
      ]),],

})
export class PartnerModule {}
