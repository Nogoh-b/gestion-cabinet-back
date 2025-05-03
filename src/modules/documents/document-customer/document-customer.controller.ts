import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Customer Documents')
@ApiConsumes('multipart/form-data')
@Controller('customers/:customerId/add-documents')
export class DocumentCustomerController {
  constructor(private readonly service: DocumentCustomerService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: CreateDocumentCustomerDto,
  })
  @ApiResponse({ status: 201, description: 'Document créé' })
  async create(
    @Param('customerId') customerId: number,
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create({ ...dto, customerId }, file);
  }

  @Get()
  @ApiOperation({ summary: "Lister les documents d'un client" })
  async findAll(@Param('customerId') customerId: number) {
    return this.service.findByCustomer(customerId);
  }
}