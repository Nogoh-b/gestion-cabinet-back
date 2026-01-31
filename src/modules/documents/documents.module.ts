import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';












import { CustomerModule } from '../customer/customer.module';
import { DocumentCategoryModule } from '../document-category/document-category.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { IamModule } from '../iam/iam.module';
import { DocumentCustomerController } from './document-customer/document-customer.controller';
import { DocumentCustomerService } from './document-customer/document-customer.service';
import { DocumentCustomer } from './document-customer/entities/document-customer.entity';
import { DocumentTypeController } from './document-type/document-type.controller';
import { DocumentTypeService } from './document-type/document-type.service';
import { DocumentType } from './document-type/entities/document-type.entity';













@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentType, DocumentCustomer]),
    CoreModule,
    DocumentCategoryModule,
    forwardRef(() => CustomerModule),
    forwardRef(() => DossiersModule),
    
    forwardRef(() => IamModule),
    

  ],
  controllers: [DocumentTypeController, DocumentCustomerController],
  providers: [DocumentTypeService, DocumentCustomerService],
  exports: [DocumentTypeService, DocumentCustomerService, TypeOrmModule],
})
export class DocumentsModule {}
