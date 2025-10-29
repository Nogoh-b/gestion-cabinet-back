import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

import { validateDto } from 'src/core/shared/pipes/validate-dto';

import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { User } from 'src/modules/iam/user/entities/user.entity';




import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UploadedFiles,
  UseGuards,
  Query,
} from '@nestjs/common';


import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';


import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { KycSyncDto } from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { SearchDocumentCustomerDto } from './dto/document-customer-search.dto';









@ApiTags('Customer Documents')
@ApiConsumes('multipart/form-data')
@Controller('documents')
@ApiBearerAuth()
export class DocumentCustomerController {
  constructor(private readonly service: DocumentCustomerService) {}

  @Get('get/:id')
  @ApiOperation({ summary: 'Récupérer un document client par ID' })
  @ApiResponse({ status: 200, type: DocumentCustomerResponseDto })
  async findOne(@Param('id') id: number): Promise<DocumentCustomerResponseDto> {
    return this.service.findOne(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [DocumentCustomerResponseDto]  })
  async search(

    @Query() searchParams?: SearchDocumentCustomerDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(searchParams as SearchCriteria, DocumentCustomerResponseDto , paginationParams);
  }
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  }))
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
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create({ ...dto, customer_id, file }, user? user.id : 1);
  }


  @Post('/add-document/by-code')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: CreateDocumentCustomerDto,
  })
  
  @ApiResponse({ status: 201, description: 'Document créé' })
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async createByCode(
    @Param('code') code: string,
    @Param('customer_id') customer_id: string,
    @CurrentUser() user: User,
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const customer  = await this.service.findCustomerByCode(code)
    return this.create(customer.id, dto, user, file);
  }

  @Get('/validate-document/:document_id')
  @ApiResponse({ status: 201, description: 'Document créé' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async validate(
    @Param('customer_id') customer_id: number,

    @Param('document_id') document_id: number,
  ) {
    return this.service.validate(document_id);
  }

  @Get('/refuse-document/:document_id')
  @ApiResponse({ status: 201, description: 'Document créé' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async refuse(@Param('document_id') document_id: number) {
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
  // @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async createMany(
    @Param('customer_id') customer_id: number,
    @Body() dto: { documents: CreateDocumentCustomerDto[] },
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (dto.documents.length !== files.length) {
      throw new BadRequestException(
        'Mismatch between files and documents metadata.',
      );
    }
    const documentsWithFiles = dto.documents.map((doc, index) => ({
      ...doc,
      customer_id,
      file: files[index],
    }));
    const docs: DocumentCustomerResponseDto[] = [];
    for (const document of documentsWithFiles) {
      document.customer_id = customer_id;
      await validateDto(CreateDocumentCustomerDto, document);
      docs.push(await this.service.create(document));
    }

    return docs;
  }

  @Get('/get-documents')
  @ApiOperation({ summary: "Lister les documents d'un client" })
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async findAll(@Param('customer_id') customer_id: number) {
    return plainToInstance(DocumentCustomerResponseDto,this.service.findByCustomer(customer_id));
  }
  @Post('sync-kyc')
  @ApiOperation({ summary: 'Réceptionne les codes clients à synchroniser' })
  @ApiBody({ type: KycSyncDto })
  async sync(
    @Param('customer_id') customer_id: number = 1,
    @Body() dto: KycSyncDto,
  ) {
    // traite comme tu veux dans le service
    return this.service.sync(dto);
  }
}
