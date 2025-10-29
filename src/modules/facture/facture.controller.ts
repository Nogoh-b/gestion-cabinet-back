// src/facture/facture.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  ParseUUIDPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { FactureService } from './facture.service';
import { CreateFactureDto } from './dto/create-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';

@ApiTags('factures')
@Controller('factures')
export class FactureController {
  constructor(private readonly factureService: FactureService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle facture' })
  @ApiResponse({ status: HttpStatus.CREATED, type: FactureResponseDto })
  async create(@Body() createFactureDto: CreateFactureDto) {
    return this.factureService.createFacture(createFactureDto);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des factures' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async search(@Query() searchDto: SearchFactureDto) {
    return this.factureService.searchFactures(searchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une facture par son ID' })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.factureService.findOneV1(id, ['paiements']);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une facture' })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateFactureDto: UpdateFactureDto
  ) {
    return this.factureService.updateFacture(id, updateFactureDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une facture (soft delete)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.factureService.removeV1(id);
  }

  @Get('dossier/:dossierId')
  @ApiOperation({ summary: 'Récupérer les factures d\'un dossier' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  @ApiParam({ name: 'dossierId', type: String })
  async getByDossier(@Param('dossierId') dossierId: string) {
    return this.factureService.getFacturesByDossier(dossierId);
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Récupérer les factures d\'un client' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  @ApiParam({ name: 'clientId', type: String })
  async getByClient(@Param('clientId') clientId: string) {
    return this.factureService.getFacturesByClient(clientId);
  }

  @Get('statut/impayees')
  @ApiOperation({ summary: 'Récupérer les factures impayées' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async getImpayees() {
    return this.factureService.getFacturesImpayees();
  }

  @Get('statut/partiellement-payees')
  @ApiOperation({ summary: 'Récupérer les factures partiellement payées' })
  @ApiResponse({ status: HttpStatus.OK, type: [FactureResponseDto] })
  async getPartiellementPayees() {
    return this.factureService.getFacturesPartiellementPayees();
  }

  @Patch(':id/statut/:statut')
  @ApiOperation({ summary: 'Changer le statut d\'une facture' })
  @ApiResponse({ status: HttpStatus.OK, type: FactureResponseDto })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'statut', enum: ['brouillon', 'envoyee', 'partiellement_payee', 'payee', 'impayee', 'annulee'] })
  async changerStatut(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statut') statut: string
  ) {
    return this.factureService.changerStatutFacture(id, statut);
  }

  @Get('analytics/chiffre-affaires')
  @ApiOperation({ summary: 'Récupérer le chiffre d\'affaires sur une période' })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getChiffreAffaires(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date
  ) {
    return this.factureService.getChiffreAffairesParPeriode(
      new Date(dateDebut),
      new Date(dateFin)
    );
  }

  @Get('analytics/montant-encaisse')
  @ApiOperation({ summary: 'Récupérer le montant encaissé sur une période' })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getMontantEncaisse(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date
  ) {
    return this.factureService.getMontantEncaisseParPeriode(
      new Date(dateDebut),
      new Date(dateFin)
    );
  }

  @Get('analytics/statistiques')
  @ApiOperation({ summary: 'Récupérer les statistiques générales des factures' })
  async getStatistiques() {
    return this.factureService.getStatistiquesPaiements();
  }
}