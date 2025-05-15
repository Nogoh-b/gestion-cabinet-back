import { Controller, Post, Body, Get, Param, UseInterceptors, UploadedFile, BadRequestException, UploadedFiles, UseGuards } from '@nestjs/common';
import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

@ApiTags('Customer Documents')
@ApiConsumes('multipart/form-data')
@Controller('customers/:customer_id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 

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
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async create(
    @Param('customer_id') customer_id: number,
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create({ ...dto, customer_id, file} );
  }

  @Get('/validate-document/:document_id')



  @ApiResponse({ status: 201, description: 'Document créé' })
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async validate(
    @Param('customer_id') customer_id: number,

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
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
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
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
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

  @Get('/get-documents')
  @ApiOperation({ summary: "Lister les documents d'un client" })
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async findAll(@Param('customer_id') customer_id: number) {
    return this.service.findByCustomer(customer_id);
  }
}