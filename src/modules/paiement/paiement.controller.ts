// src/paiement/paiement.controller.ts
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { CreatePaiementDto } from './dto/create-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { PaiementService } from './paiement.service';

@ApiBearerAuth()
@ApiTags('paiements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('paiements')
export class PaiementController {
  constructor(private readonly paiementService: PaiementService) {}

  @Post()
  @RequirePermissions('create_paiement')
  @UseInterceptors(FileInterceptor('preuve', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Enregistrer un nouveau paiement avec preuve optionnelle' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaiementResponseDto })
  async create(
    @Body() createPaiementDto: CreatePaiementDto,
    @UploadedFile() preuve?: Express.Multer.File,
  ) {
    return this.paiementService.createPaiement(createPaiementDto, preuve);
  }

  @Get()
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: 'Rechercher des paiements' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  async search(@Query() searchDto: SearchPaiementDto) {
    return this.paiementService.searchPaiements(searchDto);
  }

  @Get('facture/:factureId')
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: "Recuperer les paiements d'une facture" })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  @ApiParam({ name: 'factureId', type: String })
  async getByFacture(@Param('factureId') factureId: string) {
    return this.paiementService.getPaiementsByFacture(factureId);
  }

  @Get('client/:clientId')
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: "Recuperer les paiements d'un client" })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  @ApiParam({ name: 'clientId', type: String })
  async getByClient(@Param('clientId') clientId: string) {
    return this.paiementService.getPaiementsByClient(clientId);
  }

  @Get('statut/en-attente')
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: 'Recuperer les paiements en attente' })
  @ApiResponse({ status: HttpStatus.OK, type: [PaiementResponseDto] })
  async getEnAttente() {
    return this.paiementService.getPaiementsEnAttente();
  }

  @Get('analytics/statistiques')
  @RequirePermissions('view_financial_reports')
  @ApiOperation({ summary: 'Recuperer les statistiques des paiements par periode' })
  @ApiQuery({ name: 'dateDebut', type: Date, required: true })
  @ApiQuery({ name: 'dateFin', type: Date, required: true })
  async getStatistiques(
    @Query('dateDebut') dateDebut: Date,
    @Query('dateFin') dateFin: Date,
  ) {
    return this.paiementService.getStatistiquesPaiementsParPeriode(
      new Date(dateDebut),
      new Date(dateFin),
    );
  }

  @Get(':id')
  @RequirePermissions('manage_payments')
  @ApiOperation({ summary: 'Recuperer un paiement par son ID' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return plainToInstance(PaiementResponseDto, this.paiementService.findOneV1(id));
  }

  @Patch(':id')
  @RequirePermissions('edit_paiement')
  @ApiOperation({ summary: 'Modifier un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePaiementDto: UpdatePaiementDto,
  ) {
    return this.paiementService.updatePaiement(id, updatePaiementDto);
  }

  @Patch(':id/valider')
  @RequirePermissions('edit_paiement')
  @ApiOperation({ summary: 'Valider un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  async valider(@Param('id', ParseUUIDPipe) id: string) {
    return this.paiementService.validerPaiement(id);
  }

  @Patch(':id/rejeter')
  @RequirePermissions('edit_paiement')
  @ApiOperation({ summary: 'Rejeter un paiement' })
  @ApiResponse({ status: HttpStatus.OK, type: PaiementResponseDto })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'raison', type: String, required: true })
  async rejeter(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('raison') raison: string,
  ) {
    return this.paiementService.rejeterPaiement(id, raison);
  }

  @Delete(':id')
  @RequirePermissions('delete_paiement')
  @ApiOperation({ summary: 'Supprimer un paiement (soft delete)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paiementService.removePaiement(id);
  }
}
