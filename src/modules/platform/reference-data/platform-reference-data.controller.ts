import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { Type, plainToInstance } from 'class-transformer';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsIn,
  ValidateNested,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  validateSync,
} from 'class-validator';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { ReferenceDataService } from '../../reference-data/reference-data.service';
import { ReferenceItem } from '../../reference-data/reference-data.types';
import { PlatformReferenceAiService } from './platform-reference-ai.service';

class CreateProfileDto {
  @IsString() @MaxLength(150) name: string;
  @IsOptional() @IsUUID() source_profile_id?: string;
}
class SaveReferenceDto {
  @IsObject() item: ReferenceItem;
  @IsInt() @Min(1) expected_version: number;
}
class RolePermissionAssignmentDto {
  @IsString() @MaxLength(64) role_key: string;
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  permissions: string[];
}
class VersionDto {
  @IsInt() @Min(1) expected_version: number;
}
class RolePermissionsDto extends VersionDto {
  @IsUUID() expected_revision_id: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionAssignmentDto)
  assignments: RolePermissionAssignmentDto[];
}
class RestoreDto {
  @IsUUID() revision_id: string;
}
class PreviewDto {
  @IsUUID() revision_id: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  cabinet_ids: number[];
}
class ApplyDto {
  @IsObject() overrides: Record<string, string[]>;
}
class AiQuestionDto {
  @IsString() @MaxLength(12000) question: string;
  @IsOptional() @IsString() @MaxLength(60) kind?: string;
  @IsOptional() @IsInt() @Min(1) cabinet_id?: number;
  @IsOptional() @IsString() @MaxLength(80) provider_id?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
  @IsOptional() @IsIn(['fast', 'balanced', 'precise']) quality?:
    | 'fast'
    | 'balanced'
    | 'precise';
  @IsOptional() @IsIn(['auto', 'explain', 'propose', 'compare']) mode?:
    | 'auto'
    | 'explain'
    | 'propose'
    | 'compare';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(260, { each: true })
  selected_ids?: string[];
}
@ApiTags('Plateforme — Référentiels')
@Controller('platform/reference-data')
@PlatformRoute('owner', 'support')
export class PlatformReferenceDataController {
  constructor(
    private readonly refs: ReferenceDataService,
    private readonly ai: PlatformReferenceAiService,
  ) {}
  @Get('cabinets/:cabinetId/effective') cabinet(
    @Param('cabinetId') cabinetId: string,
  ) {
    return this.refs.effective(Number(cabinetId));
  }
  @Get('profiles') list() {
    return this.refs.list();
  }
  @Post('profiles')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.profile.create',
    targetType: 'reference_profile',
  })
  create(
    @Body() body: CreateProfileDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.create(body.name, body.source_profile_id, admin.id);
  }
  @Get('profiles/:id') detail(@Param('id') id: string) {
    return this.refs.detail(id);
  }
  @Get('profiles/:id/changes') changes(@Param('id') id: string) {
    return this.refs.draftChanges(id);
  }
  @Post('profiles/:id/draft')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.draft.create',
    targetType: 'reference_profile',
  })
  draft(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.ensureDraft(id, admin.id);
  }
  @Delete('profiles/:id/draft')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.draft.discard',
    targetType: 'reference_profile',
  })
  discard(@Param('id') id: string) {
    return this.refs.discardDraft(id);
  }
  @Put('profiles/:id/items')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.item.save',
    targetType: 'reference_profile',
  })
  save(
    @Param('id') id: string,
    @Body() body: SaveReferenceDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.saveItem(id, body.item, body.expected_version, admin.id);
  }
  @Put('profiles/:id/role-permissions')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.role_permissions.save',
    targetType: 'reference_profile',
  })
  rolePermissions(
    @Param('id') id: string,
    @Body() body: RolePermissionsDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.saveRolePermissions(
      id,
      body.assignments,
      body.expected_revision_id,
      body.expected_version,
      admin.id,
    );
  }
  @Post('profiles/:id/validate') validate(@Param('id') id: string) {
    return this.refs.validate(id);
  }
  @Post('profiles/:id/publish')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.revision.publish',
    targetType: 'reference_profile',
  })
  publish(
    @Param('id') id: string,
    @Body() body: VersionDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.publish(id, body.expected_version, admin.id);
  }
  @Post('profiles/:id/restore')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.revision.restore',
    targetType: 'reference_profile',
  })
  restore(
    @Param('id') id: string,
    @Body() body: RestoreDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.ensureDraft(id, admin.id, body.revision_id);
  }
  @Put('profiles/:id/default')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.profile.default',
    targetType: 'reference_profile',
  })
  setDefault(@Param('id') id: string) {
    return this.refs.setDefault(id);
  }
  @Put('profiles/:id/archive')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.profile.archive',
    targetType: 'reference_profile',
  })
  archive(@Param('id') id: string) {
    return this.refs.archive(id);
  }
  @Get('deployments') deployments() {
    return this.refs.deployments();
  }
  @Get('deployments/:id') deployment(@Param('id') id: string) {
    return this.refs.deployment(id);
  }
  @Post('deployments/preview')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.deployment.preview',
    targetType: 'reference_deployment',
  })
  preview(
    @Body() body: PreviewDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.preview(body.revision_id, body.cabinet_ids, admin.id);
  }
  @Post('deployments/:id/apply')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.deployment.enqueue',
    targetType: 'reference_deployment',
  })
  apply(@Param('id') id: string, @Body() body: ApplyDto) {
    return this.refs.enqueue(id, body.overrides);
  }
  @Post('deployments/:id/retry')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.deployment.retry',
    targetType: 'reference_deployment',
  })
  retry(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.refs.retry(id, admin.id);
  }
  @Get('profiles/:id/ai/history')
  history(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.history(id, admin.id);
  }
  @Get('profiles/:id/ai/pending')
  pending(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.pending(id, admin.id);
  }
  @Post('profiles/:id/ai/ask')
  ask(
    @Param('id') id: string,
    @Body() body: AiQuestionDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.ask(id, body.question, admin, body.kind, body.cabinet_id, {
      mode: body.mode,
      selected_ids: body.selected_ids,
      provider_id: body.provider_id,
      model: body.model,
      quality: body.quality,
    });
  }
  @Get('ai/models')
  models() {
    return this.ai.models();
  }
  @Post('profiles/:id/ai/ask-with-files')
  @UseInterceptors(
    FilesInterceptor('files', 3, {
      limits: { fileSize: 10 * 1024 * 1024, fields: 1, fieldSize: 20000 },
    }),
  )
  askWithFiles(
    @Param('id') id: string,
    @Body('request') request: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    let body: AiQuestionDto;
    try {
      const parsed = JSON.parse(request);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error();
      body = plainToInstance(AiQuestionDto, parsed);
      if (
        validateSync(body, { whitelist: true, forbidNonWhitelisted: true })
          .length
      )
        throw new Error();
    } catch {
      throw new BadRequestException(
        'La demande est incomplète. Vérifiez votre message et vos choix.',
      );
    }
    return this.ai.ask(
      id,
      body.question,
      admin,
      body.kind,
      body.cabinet_id,
      body,
      files ?? [],
    );
  }
  @Post('ai/proposals/:id/accept')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'reference.ai.accept',
    targetType: 'reference_ai_proposal',
  })
  accept(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.accept(id, admin.id);
  }
}
