// src/facture/facture.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
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
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';

import { CreateFactureDto } from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { FactureStatsDto } from './dto/facture-stats.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { FactureStatsService } from './facture-stats.service';
import { FactureService } from './facture.service';

@ApiBearerAuth()
@ApiTags('factures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('factures')
export class FactureController {
  constructor(
    private readonly factureService: FactureService,
    private readonly statsService: FactureStatsService,
  ) {}

  @Get('stats')
  @RequirePermissions('view_financial_reports')
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('clientId') clientId?: number,
  ): Promise<FactureStatsDto> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      clientId: clientId ? +clientId : undefined,
      fieldToUseForDate: 'dateFacture',
    });
  }

  @Get('unpaid')
  @RequirePermissions('view_factures')
  async getUnpaidInvoices() {
    const stats = await this.statsService.getStats({});
    return stats.unpaidInvoices;
  }

  @Get('overdue')
  @RequirePermissions('view_factures')
  async getOverdueStats() {
    const stats = await this.statsService.getStats({});
    return stats.overdueStats;
  }

  @Get('search')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Resultats de recherche', type: [FactureResponseDto] })
  async search(
    @Query() searchParams?: SearchFactureDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.factureService.searchWithTransformer(
      searchParams as SearchCriteria,
      FactureResponseDto,
      paginationParams,
    );
  }

  @Get('dossier/:dossierId/export')
  @RequirePermissions('download_facture')
  @ApiOperation({ summary: "Exporter les factures d'un dossier (CSV comptable)" })
  @ApiParam({ name: 'dossierId', type: String })
  async exportByDossier(@Param('dossierId') dossierId: string, @Res() res: Response) {
    const { filename, content } = await this.factureService.exportDossierFacturesCsv(dossierId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Post('dossier/:dossierId/relance')
  @RequirePermissions('email_facture')
  @ApiOperation({ summary: 'Envoyer une relance de paiement au client pour les factures impayees du dossier' })
  @ApiParam({ name: 'dossierId', type: String })
  async relanceByDossier(@Param('dossierId') dossierId: string) {
    return this.factureService.sendRelanceForDossier(dossierId);
  }

  @Get('dossier/:dossierId')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: "Recuperer les factures d'un dossier" })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  @ApiParam({ name: 'dossierId', type: String })
  async getByDossier(@Param('dossierId') dossierId: string) {
    return this.factureService.getFacturesByDossier(dossierId);
  }

  @Get('client/:clientId')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: "Recuperer les factures d'un client" })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  @ApiParam({ name: 'clientId', type: String })
  async getByClient(@Param('clientId') clientId: string) {
    return this.factureService.getFacturesByClient(clientId);
  }

  @Get('statut/impayees')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: 'Recuperer les factures impayees' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async getImpayees() {
    return this.factureService.getFacturesImpayees();
  }

  @Get('statut/partiellement-payees')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: 'Recuperer les factures partiellement payees' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async getPartiellementPayees() {
    return this.factureService.getFacturesPartiellementPayees();
  }

  @Get('analytics/chiffre-affaires')
  @RequirePermissions('view_financial_reports')
  @ApiOperation({ summary: "Recuperer le chiffre d'affaires sur une periode" })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getChiffreAffaires(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
  ) {
    return this.factureService.getChiffreAffairesParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get('analytics/montant-encaisse')
  @RequirePermissions('view_financial_reports')
  @ApiOperation({ summary: 'Recuperer le montant encaisse sur une periode' })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getMontantEncaisse(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
  ) {
    return this.factureService.getMontantEncaisseParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get('analytics/statistiques')
  @RequirePermissions('view_financial_reports')
  @ApiOperation({ summary: 'Recuperer les statistiques generales des factures' })
  async getStatistiques() {
    return this.factureService.getStatistiquesPaiements();
  }

  @Get()
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: 'Rechercher des factures' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async search1(@Query() searchDto: SearchFactureDto) {
    return this.factureService.searchFactures(searchDto);
  }

  @Post()
  @RequirePermissions('create_facture')
  @ApiOperation({ summary: 'Creer une nouvelle facture' })
  @ApiResponse({ status: HttpStatus.CREATED, type: FactureResponseDto })
  async create(@Body() createFactureDto: CreateFactureDto) {
    return this.factureService.createFacture(createFactureDto);
  }

  @Get(':id')
  @RequirePermissions('view_factures')
  @ApiOperation({ summary: 'Recuperer une facture par son ID' })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return plainToInstance(
      FactureResponseDto,
      this.factureService.findOneV1(id, ['paiements', 'dossier', 'client']),
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_facture')
  @ApiOperation({ summary: 'Modifier une facture' })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFactureDto: UpdateFactureDto,
  ) {
    return this.factureService.updateFacture(id, updateFactureDto);
  }

  @Delete(':id')
  @RequirePermissions('delete_facture')
  @ApiOperation({ summary: 'Supprimer une facture (soft delete)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.factureService.removeV1(id);
  }

  @Patch(':id/statut/:statut')
  @RequirePermissions('edit_facture')
  @ApiOperation({ summary: "Changer le statut d'une facture" })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'statut', enum: ['brouillon', 'envoyee', 'partiellement_payee', 'payee', 'impayee', 'annulee'] })
  async changerStatut(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statut') statut: string,
  ) {
    return this.factureService.changerStatutFacture(id, statut);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('edit_facture')
  @ApiOperation({ summary: "Changer le statut d'une facture" })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'status', enum: [0, 1, 2, 3, 4, 5] })
  async changerStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('status') status: string,
  ) {
    return this.factureService.changerStatutFacture(id, status);
  }
}
