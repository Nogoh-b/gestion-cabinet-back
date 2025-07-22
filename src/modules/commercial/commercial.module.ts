import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';


import { TypeOrmModule } from '@nestjs/typeorm';


import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { TransactionModule } from '../transaction/transaction.module';
import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { Commercial } from './entities/commercial.entity';





@Module({
  controllers: [CommercialController],
  providers: [CommercialService],
  exports: [CommercialService],
  imports: [
    CoreModule,
    forwardRef(() => CustomerModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => SavingsAccountModule),
    forwardRef(() => TransactionModule),
    TypeOrmModule.forFeature([
          Commercial
        ]),
        ],
})
export class CommercialModule {}
