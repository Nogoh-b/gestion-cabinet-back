import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  ParseIntPipe,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiConsumes,
  getSchemaPath,
} from '@nestjs/swagger';



import { SavingsAccount } from '../savings-account/entities/savings-account.entity';
import { DocumentSavingAccountService } from './document-saving-account.service';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { DocumentSavingAccount } from './entities/document-saving-account.entity';



@ApiTags('Document Saving Accounts ....')
@Controller('documents/savings-accounts')
export class DocumentSavingAccountController {
  constructor(private readonly service: DocumentSavingAccountService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un document par ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: DocumentSavingAccount })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un document par ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: DocumentSavingAccount })
  findAllByPersonne1(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  

  @Get('pending/by/savings-accounts')
  @ApiOperation({ summary: 'Liste tous les comptes en épargne' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  findAllByPersonne(  
    @Query() query: PaginationQueryDto
  ) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.service.findAllPendingDocBySavingAcounts(
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined);
  }



  @Post()
  @ApiOperation({ summary: 'Upload et crée un document pour un compte épargne' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    type: CreateDocumentSavingAccountDto,
    description: 'Upload document',

  })
  @ApiResponse({ status: 201, type: DocumentSavingAccount })
  createSingle(
    @Body() dto: CreateDocumentSavingAccountDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('------',file , ' --dto-- ',dto , '--')
    if (!file) throw new BadRequestException('Aucun fichier uploadé 1');
    return this.service.createSingle(dto, file);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Upload et crée plusieurs documents' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        dtos: { type: 'array', items: { $ref: getSchemaPath(CreateDocumentSavingAccountDto) } },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['dtos', 'files'],
    },
  })
  @UseInterceptors(FilesInterceptor('files'))
  @ApiResponse({ status: 201, type: [DocumentSavingAccount] })
  createMultiple(
    @Body() dtos: CreateDocumentSavingAccountDto[],
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return {files, dtos}
    if (!files || files.length !== dtos.length) {
      throw new BadRequestException('Le nombre de fichiers ne correspond pas aux données');
    }
    return this.service.createMultiple(dtos, files);
  }

  @Patch(':id/validate')
  @ApiOperation({ summary: 'Valide un document soumis' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: DocumentSavingAccount })
  validate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.validateDocument(id);
  }

  @Patch(':id/refuse')
  @ApiOperation({ summary: 'Refuse un document soumis' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: DocumentSavingAccount })
  refuse(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.refuseDocument(id);
  }

  @Get(':accountId/pendings')
  @ApiResponse({ status: 201, description: 'Document créé' })
  async getPendingDocuments(
      @Param('accountId') accountId: number, // D'abord capturer comme string
      @Query('page') page: string = '1',
      @Query('limit') limit: string = '10'
  ) {
        // const parsedAccountId = this.parseId(accountId);
      const parsedPage = parseInt(page, 10) || 1;
      const parsedLimit = parseInt(limit, 10) || 10;
      return this.service.findDocumentsByAccount(accountId, 0, 1, 100);
  }


  @Get(':accountId/approved')
  @ApiOperation({ summary: 'Get approved documents for a savings account' })
  async getApprovedDocuments(
    @Param('accountId') accountId: string, // D'abord capturer comme string
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
        const parsedAccountId = this.parseId(accountId);
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;
    return this.service.findDocumentsByAccount(parsedAccountId, 1, parsedPage, parsedLimit);
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Get approved documents for a savings account' })
  async getDocuments(
    @Param('accountId') accountId: string, // D'abord capturer comme string
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
        const parsedAccountId = this.parseId(accountId);
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;
    return this.service.findDocumentsByAccount(parsedAccountId, 1, parsedPage, parsedLimit);
  }

  @Get(':accountId/rejected')
  @ApiOperation({ summary: 'Get rejected documents for a savings account' })
  async getRejectedDocuments(
    @Param('accountId') accountId: string, // D'abord capturer comme string
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
        const parsedAccountId = this.parseId(accountId);
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;
    return this.service.findDocumentsByAccount(parsedAccountId, 2, parsedPage, parsedLimit);
  }
    private parseId(id: string): number {
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException('Invalid account ID format');
    }
    return parsed;
  }
}
