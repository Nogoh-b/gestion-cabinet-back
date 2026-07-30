import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Response } from 'express';

import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { CreateFactureDto } from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { InvoiceCancelDto } from './dto/invoice-cancel.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { FactureService } from './facture.service';
import { FactureStatsService } from './facture-stats.service';
import {
  CreateCreditNoteDto,
  InvoiceDispositionDto,
} from './dto/credit-note.dto';

@ApiTags('factures')
@ApiBearerAuth()
@Controller('factures')
@UseGuards(RolesGuard, PermissionsGuard)
export class FactureController {
  constructor(
    private readonly factureService: FactureService,
    private readonly statsService: FactureStatsService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  private actor(user: any): ResourceActor {
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

  private assertAdmin(user: any): void {
    const actor = this.actor(user);
    if (
      actor.role !== 'admin' &&
      !actor.permissions?.includes('SUPER_ADMIN')
    ) {
      throw new ForbiddenException(
        'Les données financières consolidées sont réservées à l’administration',
      );
    }
  }

  private async assertInvoiceAccess(
    id: string,
    user: any,
    mode: 'read' | 'write',
    permission: string,
  ): Promise<void> {
    const dossierId = await this.factureService.getInvoiceDossierId(id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      mode,
      permission,
    );
  }

  @Get('stats')
  @RequirePermissions('view_financial_reports')
  async getStats(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('clientId') clientId?: number,
  ) {
    this.assertAdmin(user);
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      clientId: clientId ? +clientId : undefined,
      fieldToUseForDate: 'dateFacture',
    });
  }

  @Get('unpaid')
  @RequirePermissions('view_factures')
  async getUnpaidInvoices(@CurrentUser() user: any) {
    const stats = await this.statsService.getStats({});
    return this.filterAccessible(stats.unpaidInvoices, user);
  }

  @Get('overdue')
  @RequirePermissions('view_financial_reports')
  async getOverdueStats(@CurrentUser() user: any) {
    this.assertAdmin(user);
    return (await this.statsService.getStats({})).overdueStats;
  }

  @Get('search')
  @RequirePermissions('view_factures')
  async search(
    @CurrentUser() user: any,
    @Query() searchParams?: SearchFactureDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    const result: any = await this.factureService.searchWithTransformer(
      searchParams as SearchCriteria,
      FactureResponseDto,
      paginationParams,
    );
    return this.filterSearchResult(result, user);
  }

  @Get('analytics/chiffre-affaires')
  @RequirePermissions('view_financial_reports')
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getChiffreAffaires(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
    @CurrentUser() user: any,
  ) {
    this.assertAdmin(user);
    return this.factureService.getChiffreAffairesParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get('analytics/montant-encaisse')
  @RequirePermissions('view_financial_reports')
  async getMontantEncaisse(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
    @CurrentUser() user: any,
  ) {
    this.assertAdmin(user);
    return this.factureService.getMontantEncaisseParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get('analytics/statistiques')
  @RequirePermissions('view_financial_reports')
  async getStatistiques(@CurrentUser() user: any) {
    this.assertAdmin(user);
    return this.factureService.getStatistiquesPaiements();
  }

  @Get('dossier/:dossierId/export')
  @RequirePermissions('download_facture')
  async exportByDossier(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      'read',
      'download_facture',
    );
    const { filename, content } =
      await this.factureService.exportDossierFacturesCsv(String(dossierId));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(content);
  }

  @Get('dossier/:dossierId')
  @RequirePermissions('view_factures')
  async getByDossier(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @CurrentUser() user: any,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      'read',
      'view_factures',
    );
    return this.factureService.getFacturesByDossier(String(dossierId));
  }

  @Post('dossier/:dossierId/relance')
  @RequirePermissions('email_facture')
  async relanceByDossier(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @CurrentUser() user: any,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      'write',
      'email_facture',
    );
    return this.factureService.sendRelanceForDossier(String(dossierId));
  }

  @Get('client/:clientId')
  @RequirePermissions('view_factures')
  async getByClient(
    @Param('clientId') clientId: string,
    @CurrentUser() user: any,
  ) {
    return this.filterAccessible(
      await this.factureService.getFacturesByClient(clientId),
      user,
    );
  }

  @Get('statut/impayees')
  @RequirePermissions('view_factures')
  async getImpayees(@CurrentUser() user: any) {
    return this.filterAccessible(
      await this.factureService.getFacturesImpayees(),
      user,
    );
  }

  @Get('statut/partiellement-payees')
  @RequirePermissions('view_factures')
  async getPartiellementPayees(@CurrentUser() user: any) {
    return this.filterAccessible(
      await this.factureService.getFacturesPartiellementPayees(),
      user,
    );
  }

  @Post()
  @RequirePermissions('create_facture')
  @ApiResponse({ status: HttpStatus.CREATED, type: FactureResponseDto })
  async create(
    @Body() dto: CreateFactureDto,
    @CurrentUser() user: any,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      dto.dossierId,
      this.actor(user),
      'write',
      'create_facture',
    );
    return this.factureService.createFacture(dto, {
      actor: this.actor(user),
    });
  }

  @Get()
  @RequirePermissions('view_factures')
  async list(@Query() searchDto: SearchFactureDto, @CurrentUser() user: any) {
    return this.filterSearchResult(
      await this.factureService.searchFactures(searchDto),
      user,
    );
  }

  @Get(':id')
  @RequirePermissions('view_factures')
  @ApiParam({ name: 'id', type: String })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'read', 'view_factures');
    return plainToInstance(
      FactureResponseDto,
      await this.factureService.findOneV1(id, [
        'paiements',
        'dossier',
        'client',
      ]),
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_facture')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFactureDto,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.updateFacture(id, dto);
  }

  @Post(':id/issue')
  @RequirePermissions('edit_facture')
  async issue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.issueInvoice(id, this.actor(user));
  }

  @Post(':id/validate')
  @RequirePermissions('edit_facture')
  async validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.validateInvoice(id, this.actor(user));
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_facture')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceCancelDto,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.cancelInvoice(
      id,
      dto.raison,
      this.actor(user),
    );
  }

  @Post(':id/credit-notes')
  @RequirePermissions('edit_facture')
  async createCreditNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.createCreditNote(id, dto, this.actor(user));
  }

  @Post(':id/waive')
  @RequirePermissions('edit_facture')
  async waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceDispositionDto,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.waiveInvoice(
      id,
      dto.raison,
      this.actor(user),
    );
  }

  @Post(':id/bad-debt')
  @RequirePermissions('edit_facture')
  async badDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceDispositionDto,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'edit_facture');
    return this.factureService.markBadDebt(
      id,
      dto.raison,
      this.actor(user),
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_facture')
  @ApiOperation({ summary: 'Suppression physique interdite' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertInvoiceAccess(id, user, 'write', 'delete_facture');
    return this.factureService.removeInvoice();
  }

  private async filterAccessible(items: any[], user: any): Promise<any[]> {
    const accessible = new Set(
      await this.resourcePolicy.getAccessibleDossierIds(this.actor(user)),
    );
    return (items ?? []).filter((invoice) =>
      accessible.has(Number(invoice.dossier_id ?? invoice.dossier?.id)),
    );
  }

  private async filterSearchResult(result: any, user: any): Promise<any> {
    if (Array.isArray(result)) return this.filterAccessible(result, user);
    if (Array.isArray(result?.data)) {
      result.data = await this.filterAccessible(result.data, user);
      if (result.meta) {
        result.meta.total = result.data.length;
        result.meta.total_pages = result.data.length ? 1 : 0;
      }
    }
    return result;
  }
}
