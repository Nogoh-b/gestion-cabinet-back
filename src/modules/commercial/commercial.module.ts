import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';


import { TypeOrmModule } from '@nestjs/typeorm';




import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Commercial } from './entities/commercial.entity';







@Module({
  imports: [
      forwardRef(() => CoreModule),
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
