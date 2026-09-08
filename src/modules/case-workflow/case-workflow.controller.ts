import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { BillableItemStatus } from './case-workflow.enums';
import {
  ActionTransitionDto,
  ApplyWorkflowMigrationDto,
  AdjustBillableItemDto,
  CloseDossierV2Dto,
  CompleteDossierActionDto,
  CreateActionFamilyDto,
  CreateActionDefinitionDto,
  CreateDossierBillingRuleDto,
  CreateDossierActionDto,
  CreateManualBillableItemDto,
  CreateLegacyWorkflowMappingDto,
  DeferRecommendationDto,
  ExtendDossierActionDeadlineDto,
  GenerateInvoiceFromItemsDto,
  ReviewBillableItemDto,
  ReopenDossierDto,
  ReviseDossierBillingRuleDto,
  ReviseActionDefinitionDto,
  ReviseLegacyWorkflowMappingDto,
  UpdateBillingProfileDto,
  UpdateActionFamilyDto,
  UpdateCaseWorkflowFeatureDto,
  WaiveBillableItemDto,
} from './dto/case-workflow.dto';
import { ActionCatalogService } from './services/action-catalog.service';
import { CaseBillingService } from './services/case-billing.service';
import { CaseWorkflowService } from './services/case-workflow.service';
import { DossierActionService } from './services/dossier-action.service';

function requireIdempotencyKey(value?: string): string {
  const key = value?.trim();
  if (!key)
    throw new BadRequestException('L’en-tête Idempotency-Key est obligatoire');
  if (key.length > 180)
    throw new BadRequestException('Idempotency-Key est trop long');
  return key;
}

function actorId(user: User): number {
  return Number(user.id);
}

@Controller('action-catalog')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ActionCatalogController {
  constructor(private readonly catalogService: ActionCatalogService) {}

  @Get('families')
  @RequirePermissions('view_dossier_actions')
  getFamilies() {
    return this.catalogService.getFamilies();
  }

  @Get('families/manage')
  @RequirePermissions('manage_action_catalog')
  getFamiliesForManagement() {
    return this.catalogService.getFamilies(true);
  }

  @Post('families')
  @RequirePermissions('manage_action_catalog')
  createFamily(@Body() dto: CreateActionFamilyDto) {
    return this.catalogService.createFamily(dto);
  }

  @Patch('families/:id')
  @RequirePermissions('manage_action_catalog')
  updateFamily(@Param('id') id: string, @Body() dto: UpdateActionFamilyDto) {
    return this.catalogService.updateFamily(id, dto);
  }

  @Post('definitions')
  @RequirePermissions('manage_action_catalog')
  createDefinition(@Body() dto: CreateActionDefinitionDto) {
    return this.catalogService.createDefinition(dto);
  }

  @Patch('definitions/:id')
  @RequirePermissions('manage_action_catalog')
  reviseDefinition(
    @Param('id') id: string,
    @Body() dto: ReviseActionDefinitionDto,
  ) {
    return this.catalogService.reviseDefinition(id, dto);
  }
}

@Controller('case-workflow/settings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CaseWorkflowSettingsController {
  constructor(private readonly workflowService: CaseWorkflowService) {}

  @Get()
  @RequirePermissions('manage_action_catalog')
  get() {
    return this.workflowService.getFeature();
  }

  @Get('monitoring')
  @RequirePermissions('manage_action_catalog')
  monitoring() {
    return this.workflowService.getMonitoring();
  }

  @Patch()
  @RequirePermissions('manage_action_catalog')
  update(@Body() dto: UpdateCaseWorkflowFeatureDto) {
    return this.workflowService.updateFeature(
      dto.enabled,
      dto.default_for_new_dossiers,
    );
  }
}

@Controller('workflow-mappings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WorkflowMappingsController {
  constructor(private readonly workflowService: CaseWorkflowService) {}

  @Get()
  @RequirePermissions('manage_action_catalog')
  list() {
    return this.workflowService.listLegacyMappings();
  }

  @Post()
  @RequirePermissions('manage_action_catalog')
  create(@Body() dto: CreateLegacyWorkflowMappingDto) {
    return this.workflowService.createLegacyMapping(dto);
  }

  @Patch(':id')
  @RequirePermissions('manage_action_catalog')
  revise(@Param('id') id: string, @Body() dto: ReviseLegacyWorkflowMappingDto) {
    return this.workflowService.reviseLegacyMapping(id, dto);
  }
}

@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DossierWorkspaceController {
  constructor(
    private readonly workflowService: CaseWorkflowService,
    private readonly actionService: DossierActionService,
    private readonly billingService: CaseBillingService,
  ) {}

  @Get(':id/workspace')
  @RequirePermissions('view_dossier_actions')
  getWorkspace(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.getWorkspace(id, user);
  }

  @Post(':id/opening/validate')
  @RequirePermissions('create_dossier_action')
  validateOpening(
    @Param('id', ParseIntPipe) id: number,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.validateOpening(
      id,
      requireIdempotencyKey(key),
      user,
    );
  }

  @Get(':id/billing-profile')
  @RequirePermissions('view_billable_items')
  getBillingProfile(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.getProfile(id);
  }

  @Patch(':id/billing-profile')
  @RequirePermissions('manage_billable_items')
  updateBillingProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBillingProfileDto,
  ) {
    return this.billingService.updateProfile(id, dto);
  }

  @Get(':id/billing-rules')
  @RequirePermissions('view_billable_items')
  getBillingRules(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.listRules(id);
  }

  @Post(':id/billing-rules')
  @RequirePermissions('manage_billable_items')
  createBillingRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDossierBillingRuleDto,
  ) {
    return this.billingService.createRule(id, dto);
  }

  @Post(':id/billable-items/manual')
  @RequirePermissions('manage_billable_items')
  createManualBillableItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateManualBillableItemDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.createManualItem(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/actions')
  @RequirePermissions('create_dossier_action')
  createAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDossierActionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.create(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Get(':id/billable-items')
  @RequirePermissions('view_billable_items')
  getBillableItems(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: BillableItemStatus,
  ) {
    return this.billingService.listItems(id, { from, to, status });
  }

  @Get(':id/closure-check')
  @RequirePermissions('close_dossier')
  getClosureCheck(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.closureCheck(id, user);
  }

  @Post(':id/close')
  @RequirePermissions('close_dossier')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseDossierV2Dto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.close(
      id,
      dto,
      user,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/reopen')
  @RequirePermissions('reopen_dossier')
  reopen(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenDossierDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.reopen(
      id,
      dto,
      user,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/workflow-migration/preview')
  @RequirePermissions('migrate_dossier_workflow')
  previewMigration(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.previewMigration(id, user);
  }

  @Post(':id/workflow-migration/apply')
  @RequirePermissions('migrate_dossier_workflow')
  applyMigration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyWorkflowMigrationDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.applyMigration(id, dto, user);
  }

  @Post(':id/workflow-migration/confirm')
  @RequirePermissions('migrate_dossier_workflow')
  confirmMigration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyWorkflowMigrationDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.confirmMigration(id, dto, user);
  }

  @Post(':id/workflow-migration/rollback')
  @RequirePermissions('migrate_dossier_workflow')
  rollbackMigration(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyWorkflowMigrationDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowService.rollbackMigration(id, dto, user);
  }
}

@Controller('actions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DossierActionsController {
  constructor(private readonly actionService: DossierActionService) {}

  @Post(':id/start')
  @RequirePermissions('update_dossier_action')
  start(
    @Param('id') id: string,
    @Body() dto: ActionTransitionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.start(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/hold')
  @RequirePermissions('update_dossier_action')
  hold(
    @Param('id') id: string,
    @Body() dto: ActionTransitionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.hold(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/complete')
  @RequirePermissions('update_dossier_action')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteDossierActionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.complete(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/extend-deadline')
  @RequirePermissions('update_dossier_action')
  extendDeadline(
    @Param('id') id: string,
    @Body() dto: ExtendDossierActionDeadlineDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.extendDeadline(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('update_dossier_action')
  cancel(
    @Param('id') id: string,
    @Body() dto: ActionTransitionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.cancel(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }
}

@Controller('recommendations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RecommendationsController {
  constructor(private readonly actionService: DossierActionService) {}

  @Post(':id/start')
  @RequirePermissions('create_dossier_action')
  start(
    @Param('id') id: string,
    @Body() dto: ActionTransitionDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.startRecommendation(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/defer')
  @RequirePermissions('update_dossier_action')
  defer(
    @Param('id') id: string,
    @Body() dto: DeferRecommendationDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.actionService.deferRecommendation(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }
}

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CaseInvoicesController {
  constructor(private readonly billingService: CaseBillingService) {}

  @Post('from-billable-items')
  @RequirePermissions('generate_invoice_from_items')
  generate(
    @Body() dto: GenerateInvoiceFromItemsDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.invoiceFromItems(
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }
}

@Controller('billable-items')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BillableItemsController {
  constructor(private readonly billingService: CaseBillingService) {}

  @Post(':id/review')
  @RequirePermissions('manage_billable_items')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewBillableItemDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.reviewItem(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/waive')
  @RequirePermissions('manage_billable_items')
  waive(
    @Param('id') id: string,
    @Body() dto: WaiveBillableItemDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.waiveItem(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }

  @Post(':id/adjust')
  @RequirePermissions('manage_billable_items')
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustBillableItemDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.adjustItem(
      id,
      dto,
      requireIdempotencyKey(key),
      actorId(user),
    );
  }
}

@Controller('billing-rules')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BillingRulesController {
  constructor(private readonly billingService: CaseBillingService) {}

  @Post(':id/revise')
  @RequirePermissions('manage_billable_items')
  revise(@Param('id') id: string, @Body() dto: ReviseDossierBillingRuleDto) {
    return this.billingService.reviseRule(id, dto);
  }
}
