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
}
