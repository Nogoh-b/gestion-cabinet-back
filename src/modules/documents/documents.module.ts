import { forwardRef, Module } from '@nestjs/common';
import { DocumentTypeService } from './document-type/document-type.service';
import { DocumentCustomerService } from './document-customer/document-customer.service';
import { DocumentTypeController } from './document-type/document-type.controller';
import { DocumentCustomerController } from './document-customer/document-customer.controller';
import { DocumentType } from './document-type/entities/document-type.entity';
import { DocumentCustomer } from './document-customer/entities/document-customer.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerModule } from '../customer/customer.module';
import { CoreModule } from 'src/core/core.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentType, DocumentCustomer]),
    forwardRef(() => CustomerModule),
    
    forwardRef(() => CoreModule),
    IamModule

  ],
  controllers: [DocumentTypeController, DocumentCustomerController],
  providers: [DocumentTypeService, DocumentCustomerService],
  exports: [DocumentTypeService, DocumentCustomerService, TypeOrmModule],
})
export class DocumentsModule {}
