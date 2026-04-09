import { forwardRef, Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';





import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { Partner } from './entities/partner.entity';








@Module({
  imports: [    
      forwardRef(() => CustomerModule),
      forwardRef(() => DocumentsModule),
      
    TypeOrmModule.forFeature([
        Partner
      ]),],

})
export class PartnerModule {}
