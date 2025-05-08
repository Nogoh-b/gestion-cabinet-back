import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile, BadRequestException, UploadedFiles } from '@nestjs/common';
import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';

@ApiTags('Customer Documents')
@ApiConsumes('multipart/form-data')
@Controller('customers/:customer_id')
export class DocumentCustomerController {
  constructor(private readonly service: DocumentCustomerService) {}

  @Post('/add-document')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: CreateDocumentCustomerDto,
  })
  @ApiResponse({ status: 201, description: 'Document créé' })
  async create(
    @Param('customer_id') customer_id: number,
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create({ ...dto, customer_id, file} );
  }

  @Get('/validate-document')
  @ApiBody({
    description: 'Validate document',
    type: CreateDocumentCustomerDto,
  })


  @ApiResponse({ status: 201, description: 'Document créé' })
  async validate(
    @Param('document_id') document_id: number,
  ) {
    return this.service.validate(document_id);
  }

   @Get('/refuse-document')
  @ApiBody({
    description: 'Refuse  document',
    type: CreateDocumentCustomerDto,
  })
  @ApiResponse({ status: 201, description: 'Document créé' })
  async refuse(
    @Param('document_id') document_id: number,
  ) {
    return this.service.refuse(document_id);
  }

  @Post('/add-documents')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: CreateDocumentCustomerDto,
  })
  @ApiResponse({ status: 201, description: 'Document créé' })
  async createMany(
    @Param('customer_id') customer_id: number,
    @Body() dto: {documents : CreateDocumentCustomerDto[]},
    @UploadedFiles() files: Express.Multer.File[],
  ) {
      if (dto.documents.length !== files.length) {
        throw new BadRequestException('Mismatch between files and documents metadata.');
      }
      const documentsWithFiles  = dto.documents.map((doc, index) => ({
        ...doc,
        customer_id,
        file: files[index]
      }));
      const docs : DocumentCustomerResponseDto[] = []
      for (const document of documentsWithFiles) {
        document.customer_id = customer_id
        await validateDto(CreateDocumentCustomerDto, document)
        docs.push(await this.service.create(document))
      }

      return docs;
    }

  @Get()
  @ApiOperation({ summary: "Lister les documents d'un client" })
  async findAll(@Param('customer_id') customer_id: number) {
    return this.service.findByCustomer(customer_id);
  }
}