// src/paiement/paiement.controller.ts
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
import { PaiementService } from './paiement.service';
import { CreatePaiementDto } from './dto/create-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { plainToInstance } from 'class-transformer';

@ApiTags('paiements')
@Controller('paiements')
export class PaiementController {
  constructor(private readonly paiementService: PaiementService) {}

  @Post()
  @ApiOperation({ summary: 'Enregistrer un nouveau paiement' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaiementResponseDto })
  async create(@Body() createPaiementDto: CreatePaiementDto) {
    return this.paiementService.createPaiement(createPaiementDto);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des paiements' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  async search(@Query() searchDto: SearchPaiementDto) {
    return this.paiementService.searchPaiements(searchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un paiement par son ID' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return plainToInstance(PaiementResponseDto, this.paiementService.findOneV1(id)) ;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updatePaiementDto: UpdatePaiementDto
  ) {
    return this.paiementService.updatePaiement(id, updatePaiementDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un paiement (soft delete)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paiementService.removeV1(id);
  }

  @Get('facture/:factureId')
  @ApiOperation({ summary: 'Récupérer les paiements d\'une facture' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  @ApiParam({ name: 'factureId', type: String })
  async getByFacture(@Param('factureId') factureId: string) {
    return this.paiementService.getPaiementsByFacture(factureId);
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Récupérer les paiements d\'un client' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  @ApiParam({ name: 'clientId', type: String })
  async getByClient(@Param('clientId') clientId: string) {
    return this.paiementService.getPaiementsByClient(clientId);
  }

  @Get('statut/en-attente')
  @ApiOperation({ summary: 'Récupérer les paiements en attente' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  async getEnAttente() {
    return this.paiementService.getPaiementsEnAttente();
  }

  @Patch(':id/valider')
  @ApiOperation({ summary: 'Valider un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async valider(@Param('id', ParseUUIDPipe) id: string) {
    return this.paiementService.validerPaiement(id);
  }

  @Patch(':id/rejeter')
  @ApiOperation({ summary: 'Rejeter un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'raison', type: String, required: true })
  async rejeter(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('raison') raison: string
  ) {
    return this.paiementService.rejeterPaiement(id, raison);
  }

  @Get('analytics/statistiques')
  @ApiOperation({ summary: 'Récupérer les statistiques des paiements par période' })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getStatistiques(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date
  ) {
    return this.paiementService.getStatistiquesPaiementsParPeriode(
      new Date(dateDebut),
      new Date(dateFin)
    );
  }
}