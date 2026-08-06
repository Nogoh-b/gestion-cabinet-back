import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ResourcePolicyService } from 'src/core/resource-policy.service';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import {
  RejectDocumentVersionDto,
  RevokeDocumentVersionDto,
  ValidateDocumentVersionDto,
} from './dto/review-document-version.dto';
import { DocumentVersionService } from './document-version.service';
import { Response } from 'express';
import { DocumentStatsService } from './document-stats.service';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentCustomerController {
  constructor(
    private readonly versionService: DocumentVersionService,
    private readonly resourcePolicy: ResourcePolicyService,
    private readonly statsService: DocumentStatsService,
  ) {}

  @Get()
  @RequirePermissions('view_documents')
  async findAll(@Req() req: any) {
    const dossierIds = await this.resourcePolicy.getAccessibleDossierIds(req.user);
    const documents = await this.versionService.listDocuments(dossierIds);
    const visible: typeof documents = [];
    for (const document of documents) {
      if (
        await this.resourcePolicy.canAccessDossierResource(
          document.dossier_id!,
          req.user,
          'view_documents',
          document.is_confidential ? 1 : 0,
        )
      ) {
        visible.push(document);
      }
    }
    return visible;
  }

  @Get('stats')
  @RequirePermissions('view_documents')
  async stats(@Req() req: any) {
    const dossierIds = await this.resourcePolicy.getAccessibleDossierIds(req.user);
    return this.statsService.getStats({
      ...req.query,
      dossierIds,
    });
  }

  @Get(':id')
  @RequirePermissions('view_documents')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.assertDocumentAccess(
      id,
      req.user,
      'read',
      'view_documents',
    );
  }

  @Post()
  @RequirePermissions('upload_document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateDocumentCustomerDto })
  @ApiOperation({
    summary:
      'Créer une fiche documentaire et sa version 1 en stockage privé',
  })
  async create(
    @Body() dto: CreateDocumentCustomerDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      Number(dto.dossier_id),
      req.user,
      'write',
      'upload_document',
      dto.is_confidential ? 1 : 0,
    );
    return this.versionService.createDocument(dto, file, req.user.id);
  }

  @Post(':id/versions')
  @RequirePermissions('upload_document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async addVersion(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(id, req.user, 'write', 'upload_document');
    return this.versionService.addVersion(id, file, req.user.id);
  }

  @Get(':id/versions')
  @RequirePermissions('view_documents')
  async listVersions(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(id, req.user, 'read', 'view_documents');
    return this.versionService.listVersions(id);
  }

  @Get(':id/versions/:versionId/content')
  @RequirePermissions('view_documents')
  async getContent(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId') versionId: string,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    await this.assertDocumentAccess(id, req.user, 'read', 'view_documents');
    const { version, buffer } = await this.versionService.readContent(
      id,
      versionId,
      req.user.id,
      {
        ip: req.ip,
        userAgent: req.headers?.['user-agent'] ?? null,
        requestId: req.headers?.['x-request-id'] ?? null,
      },
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(buffer, {
      type: version.detectedMime,
      disposition: `attachment; filename="${this.safeHeaderFilename(
        version.originalName,
      )}"`,
      length: buffer.length,
    });
  }

  @Post(':id/versions/:versionId/validate')
  @RequirePermissions('validate_document')
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId') versionId: string,
    @Body() dto: ValidateDocumentVersionDto,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(
      id,
      req.user,
      'write',
      'validate_document',
    );
    return this.versionService.validate(id, versionId, dto, req.user.id);
  }

  @Post(':id/versions/:versionId/scan')
  @RequirePermissions('validate_document')
  async rescan(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId') versionId: string,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(
      id,
      req.user,
      'write',
      'validate_document',
    );
    return this.versionService.rescan(id, versionId, req.user.id);
  }

  @Post(':id/versions/:versionId/reject')
  @RequirePermissions('reject_document')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId') versionId: string,
    @Body() dto: RejectDocumentVersionDto,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(
      id,
      req.user,
      'write',
      'reject_document',
    );
    return this.versionService.reject(id, versionId, dto, req.user.id);
  }

  @Post(':id/versions/:versionId/revoke')
  @RequirePermissions('validate_document')
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId') versionId: string,
    @Body() dto: RevokeDocumentVersionDto,
    @Req() req: any,
  ) {
    await this.assertDocumentAccess(
      id,
      req.user,
      'write',
      'validate_document',
    );
    return this.versionService.revoke(id, versionId, dto, req.user.id);
  }

  private async assertDocumentAccess(
    documentId: number,
    actor: any,
    mode: 'read' | 'write',
    permission: string,
  ) {
    const document = await this.versionService.getDocument(documentId);
    await this.resourcePolicy.assertDossierAccess(
      document.dossier_id!,
      actor,
      mode,
      permission,
      document.is_confidential ? 1 : 0,
    );
    return document;
  }

  private safeHeaderFilename(value: string): string {
    return value.replace(/[\r\n"]/g, '_').slice(0, 180);
  }
}
