import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateDto } from 'src/core/shared/pipes/validate-dto';

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

  @Post('/add-documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: CreateDocumentCustomerDto,
  })
  @ApiResponse({ status: 201, description: 'Document créé' })
  async createMany(
    @Param('customer_id') customer_id: number,
    @Body() dto: CreateDocumentCustomerDto[],
    @UploadedFile() files: Express.Multer.File[],
  ) {
    if (dto.length !== files.length) {
      throw new BadRequestException('Mismatch between files and documents metadata.');
    }
    const documentsWithFiles  = dto.map((doc, index) => ({
      ...doc,
      customer_id,
      file: files[index]
    }));
    for (const document of documentsWithFiles) {
      document.customer_id = customer_id
      await validateDto(CreateDocumentCustomerDto, document)
    }

    return this.service.createMany(documentsWithFiles);
  }

  @Get()
  @ApiOperation({ summary: "Lister les documents d'un client" })
  async findAll(@Param('customer_id') customer_id: number) {
    return this.service.findByCustomer(customer_id);
  }
}