import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

import { validateDto } from 'src/core/shared/pipes/validate-dto';

import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { User } from 'src/modules/iam/user/entities/user.entity';

import * as fs from 'fs';
import * as path from 'path';



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
  ParseIntPipe,
  Res,
  NotFoundException,
} from '@nestjs/common';


import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';


import { DocumentCustomerService } from './document-customer.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { KycSyncDto } from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { SearchDocumentCustomerDto } from './dto/document-customer-search.dto';
import { DocumentStatsService } from './document-stats.service';
import { Response } from 'express';









@ApiTags('Customer Documents')
@ApiConsumes('multipart/form-data')
@Controller('documents')
@ApiBearerAuth()
export class DocumentCustomerController {
  constructor(private readonly service: DocumentCustomerService, private readonly statsService: DocumentStatsService) {}


  @Get('stats')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dossierId') dossierId?: number,
  ): Promise<any> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      dossierId: dossierId ? +dossierId : undefined,
    });
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un document spécifique' })
  @ApiParam({ name: 'id', description: 'ID du document' })
  async getStatsForDocument(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.statsService.getStats({ documentId: id });
  }

  @Get('pending')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getPendingDocuments() {
    const stats = await this.statsService.getStats({});
    return (stats as any).pendingDocuments;
  }

  @Get('storage')
  // @Roles(UserRole.ADMIN)
  async getStorageStats() {
    const stats = await this.statsService.getStats({});
    return (stats as any).storageStats;
  }

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
    @Body() dto: CreateDocumentCustomerDto,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create({ ...dto, file }, user? user.id : 1);
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
    @CurrentUser() user: User,
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const customer  = await this.service.findCustomerByCode(code)
    return this.create( dto, user, file);
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

  @Get()
  @ApiOperation({ summary: "Lister les documents d'un client" })
  @RequirePermissions('VERIFY_CUSTOMER_KYC')
  async findAll(    @Query() searchParams?: SearchDocumentCustomerDto,
    @Query() paginationParams?: PaginationParamsDto, @Param('customer_id') customer_id?: number) {
    return plainToInstance(DocumentCustomerResponseDto,this.service.findAllV1())
    // return plainToInstance(DocumentCustomerResponseDto,this.service.findByCustomer(customer_id));
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

// Dans votre controller (par exemple document-customer.controller.ts)
@Get(':id/stream')
@UseGuards(JwtAuthGuard)
async streamDocument(
  @Param('id') id: string,
  @CurrentUser() user: User,
  @Res() res: Response,
) {
  try {
    const document = await this.service.findOne(+id);
    
    if (!document || !document.file_path) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    // Vérifier les permissions
    // await this.service.verifyAccess(id, user.id);
    
    // Rediriger vers l'URL publique si disponible
    if (document.file_url && document.file_url.startsWith('http')) {
      return res.redirect(document.file_url);
    }
    
    // Sinon, servir le fichier localement
    let filePath = document.file_path;
    
    // Remplacer les séparateurs pour Windows
    filePath = filePath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    
    const mimeType = document.file_mimetype || this.service.getMimeType(filePath);
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${document.original_name || 'document'}"`);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    console.log(stream)
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Alternative plus simple - Endpoint pour obtenir l'URL de stream
@Get(':id/stream-url')
@UseGuards(JwtAuthGuard)
async getStreamUrl(
  @Param('id') id: string,
  @CurrentUser() user: User,
) {
  // Vérifier les permissions
  // await this.service.verifyAccess(id, user.id);
  
  // Retourner l'URL de stream (qui sera interceptée par le frontend)
  return { 
    url: `/api/document-customer/${id}/stream`,
    fileUrl: `/api/document-customer/${id}/raw`
  };
}

// Endpoint direct pour servir le fichier raw
@Get(':id/raw')
@UseGuards(JwtAuthGuard)
async getRawFile(
  @Param('id') id: string,
  @CurrentUser() user: User,
  @Res() res: Response,
) {
  const document = await this.service.findOne(+id);
  
  if (!document || !document.file_url) {
    throw new NotFoundException('Document non trouvé');
  }
  
  // Si vous avez déjà un file_url accessible publiquement
  return res.redirect(document.file_url);
}
}
