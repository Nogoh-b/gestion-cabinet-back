import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';
import {
  CloseLegalDeadlineDto,
  CreateLegalDeadlineRuleDto,
  RecordLegalNotificationDto,
  UpdateLegalDeadlineRuleDto,
} from './dto/legal-deadline.dto';
import { LegalDeadlineRuleService } from './legal-deadline-rule.service';
import { LegalDeadlineService } from './legal-deadline.service';

function actorFrom(user: any): ResourceActor {
  return {
    id: Number(user?.id),
    userId: Number(user?.userId ?? user?.id),
    tenantId: Number(
      user?.tenantId ?? user?.tenant_id ?? user?.cabinetId ?? user?.cabinet_id,
    ),
    role: user?.role,
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
    customerId: user?.customerId ?? user?.customer_id ?? null,
  };
}

@ApiTags('Règles de délais juridiques')
@ApiBearerAuth()
@Controller('legal-deadline-rules')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions('manage_settings')
export class LegalDeadlineRuleController {
  constructor(private readonly service: LegalDeadlineRuleService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(
    @Body() dto: CreateLegalDeadlineRuleDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(dto, actorFrom(user));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLegalDeadlineRuleDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(+id, dto, actorFrom(user));
  }

  @Post(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.activate(+id, actorFrom(user));
  }

  @Post(':id/retire')
  retire(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.retire(+id, actorFrom(user));
  }
}

@ApiTags('Délais juridiques')
@ApiBearerAuth()
@Controller('legal-deadlines')
@UseGuards(RolesGuard, PermissionsGuard)
export class LegalDeadlineController {
  constructor(
    private readonly service: LegalDeadlineService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  @Post('notifications')
  @RequirePermissions('edit_audience')
  async recordNotification(
    @Body() dto: RecordLegalNotificationDto,
    @CurrentUser() user: any,
  ) {
    const actor = actorFrom(user);
    const dossierId = await this.service.getAudienceDossierId(dto.audience_id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      actor,
      'write',
      'edit_audience',
    );
    return this.service.recordNotification(dto, actor);
  }

  @Get('audience/:audienceId')
  @RequirePermissions('view_audiences')
  async findByAudience(
    @Param('audienceId') audienceId: string,
    @CurrentUser() user: any,
  ) {
    const actor = actorFrom(user);
    const dossierId = await this.service.getAudienceDossierId(+audienceId);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      actor,
      'read',
      'view_audiences',
    );
    return this.service.findByAudience(+audienceId);
  }

  @Get(':id')
  @RequirePermissions('view_audiences')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const actor = actorFrom(user);
    const dossierId = await this.service.getDossierId(+id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      actor,
      'read',
      'view_audiences',
    );
    return this.service.findOne(+id);
  }

  @Post(':id/complete')
  @RequirePermissions('edit_audience')
  async complete(
    @Param('id') id: string,
    @Body() dto: CloseLegalDeadlineDto,
    @CurrentUser() user: any,
  ) {
    const actor = actorFrom(user);
    const dossierId = await this.service.getDossierId(+id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      actor,
      'write',
      'edit_audience',
    );
    return this.service.complete(+id, dto.reason, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_audience')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CloseLegalDeadlineDto,
    @CurrentUser() user: any,
  ) {
    const actor = actorFrom(user);
    const dossierId = await this.service.getDossierId(+id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      actor,
      'write',
      'edit_audience',
    );
    return this.service.cancel(+id, dto.reason, actor);
  }
}
