import { Module } from '@nestjs/common';
import { DocumentTypeService } from './document-type/document-type.service';
import { DocumentCustomerService } from './document-customer/document-customer.service';
import { DocumentTypeController } from './document-type/document-type.controller';
import { DocumentCustomerController } from './document-customer/document-customer.controller';
import { DocumentType } from './document-type/entities/document-type.entity';
import { DocumentCustomer } from './document-customer/entities/document-customer.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UPLOAD_FOLDER_NAME } from 'src/core/common/constants/constants';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentType, 
      DocumentCustomer
    ]),
    CustomerModule,
    MulterModule.register({
      storage: diskStorage({
        destination: `./${UPLOAD_FOLDER_NAME}`,
        filename: (req, file, cb) => {
          const filename = `${Date.now()}-${file.originalname}`;
          cb(null, filename);
        },
      }),
    }),
    ],
  controllers: [DocumentTypeController, DocumentCustomerController],
  providers: [DocumentTypeService, DocumentCustomerService],
  exports: [DocumentTypeService, DocumentCustomerService],
})
export class DocumentsModule {}
