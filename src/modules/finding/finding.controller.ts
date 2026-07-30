import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { In } from 'typeorm';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ResourcePolicyService } from 'src/core/resource-policy.service';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { CreateFindingDto } from './dto/create-finding.dto';
import {
  FindingListResponseDto,
  FindingResponseDto,
} from './dto/response-finding.dto';
import { FindingSearchDto } from './dto/search-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { FindingsService } from './finding.service';

@ApiTags('Findings')
@ApiBearerAuth()
@Controller('findings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FindingsController {
  constructor(
    private readonly findingsService: FindingsService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  @Get('search')
  @RequirePermissions('view_diligence_findings')
  @ApiResponse({ status: 200, type: [FindingListResponseDto] })
  async search(
    @Query() searchParams: FindingSearchDto,
    @Query() paginationParams: PaginationParamsDto,
    @CurrentUser() user: any,
  ) {
    const dossierIds = await this.accessibleDossierIds(user);
    return this.findingsService.searchWithTransformer(
      {
        ...(searchParams as SearchCriteria),
        diligence: {
          dossier_id: In(dossierIds.length > 0 ? dossierIds : [-1]),
        },
      },
      FindingListResponseDto,
      paginationParams,
    );
  }

  @Get('stats/by-severity')
  @RequirePermissions('view_diligence_findings')
  async getStatsBySeverity(
    @Query('diligenceId') diligenceId: number | undefined,
    @CurrentUser() user: any,
  ) {
    const dossierIds = await this.accessibleDossierIds(user);
    if (diligenceId) {
      await this.assertDiligenceAccess(
        Number(diligenceId),
        user,
        'read',
        'view_diligence_findings',
      );
    }
    return this.findingsService.getStatsBySeverity(
      diligenceId ? Number(diligenceId) : undefined,
      dossierIds,
    );
  }

  @Get('diligence/:diligenceId')
  @RequirePermissions('view_diligence_findings')
  async findByDiligence(
    @Param('diligenceId', ParseIntPipe) diligenceId: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(
      diligenceId,
      user,
      'read',
      'view_diligence_findings',
    );
    return this.findingsService.findByDiligence(diligenceId);
  }

  @Get()
  @RequirePermissions('view_diligence_findings')
  async findAll(@CurrentUser() user: any) {
    return this.findingsService.findAll(
      await this.accessibleDossierIds(user),
    );
  }

  @Post()
  @RequirePermissions('create_diligence_finding')
  @ApiResponse({ status: 201, type: FindingResponseDto })
  async create(
    @Body() dto: CreateFindingDto,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(
      dto.diligence_id,
      user,
      'write',
      'create_diligence_finding',
    );
    return this.findingsService.create(
      dto,
      this.actorId(user),
    );
  }

  @Get(':id')
  @RequirePermissions('view_diligence_findings')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'read',
      'view_diligence_findings',
    );
    return this.findingsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('edit_diligence_finding')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFindingDto,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'edit_diligence_finding',
    );
    return this.findingsService.update(id, dto, this.actorId(user));
  }

  @Delete(':id')
  @RequirePermissions('delete_diligence_finding')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'delete_diligence_finding',
    );
    return this.findingsService.remove(id, this.actorId(user));
  }

  @Post(':id/start-analysis')
  @RequirePermissions('edit_diligence_finding')
  async startAnalysis(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'edit_diligence_finding',
    );
    return this.findingsService.startAnalysis(id, this.actorId(user));
  }

  @Post(':id/validate')
  @RequirePermissions('edit_diligence_finding')
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'edit_diligence_finding',
    );
    return this.findingsService.validate(
      id,
      this.actorId(user),
    );
  }

  @Post(':id/resolve')
  @RequirePermissions('edit_diligence_finding')
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'edit_diligence_finding',
    );
    return this.findingsService.resolve(id, this.actorId(user));
  }

  @Post(':id/waive')
  @RequirePermissions('edit_diligence_finding')
  async waive(
    @Param('id', ParseIntPipe) id: number,
    @Body('comment') comment: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.assertFindingAccess(
      id,
      user,
      'write',
      'edit_diligence_finding',
    );
    return this.findingsService.waive(id, comment, this.actorId(user));
  }

  private accessibleDossierIds(user: any): Promise<number[]> {
    return this.resourcePolicy.getAccessibleDossierIdsAtLevel(user, 1);
  }

  private actorId(user: any): number {
    return Number(user?.userId ?? user?.id);
  }

  private async assertDiligenceAccess(
    diligenceId: number,
    user: any,
    mode: 'read' | 'write',
    permission: string,
  ) {
    const scope =
      await this.findingsService.getDiligenceAccessScope(diligenceId);
    return this.resourcePolicy.assertDossierAccess(
      scope.dossierId,
      user,
      mode,
      permission,
      scope.confidentialityLevel,
    );
  }

  private async assertFindingAccess(
    findingId: number,
    user: any,
    mode: 'read' | 'write',
    permission: string,
  ) {
    const scope = await this.findingsService.getAccessScope(findingId);
    return this.resourcePolicy.assertDossierAccess(
      scope.dossierId,
      user,
      mode,
      permission,
      scope.confidentialityLevel,
    );
  }
}
