import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfTemplate } from './entities/pdf-template.entity';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfTemplatesController } from './pdf-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PdfTemplate])],
  controllers: [PdfTemplatesController],
  providers: [PdfTemplatesService],
  exports: [PdfTemplatesService],
})
export class PdfTemplatesModule {}
