import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { EcrituresService } from '../services/ecritures.service';
import { CreateEcritureDto } from '../dto/create-ecriture.dto';
import { SourceModule } from '../enums/comptabilite.enums';

@ApiTags('comptabilite-ecritures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comptabilite/ecritures')
export class EcrituresController {
  constructor(private readonly service: EcrituresService) {}

  @Get()
  @ApiOperation({ summary: 'Liste et filtre les écritures comptables' })
  @ApiQuery({ name: 'journalId',    required: false })
  @ApiQuery({ name: 'exerciceId',   required: false })
  @ApiQuery({ name: 'sourceModule', required: false, enum: SourceModule })
  @ApiQuery({ name: 'dateDebut',    required: false })
  @ApiQuery({ name: 'dateFin',      required: false })
  @ApiQuery({ name: 'page',         required: false })
  @ApiQuery({ name: 'limit',        required: false })
  search(
    @Query('journalId')    journalId?:    number,
    @Query('exerciceId')   exerciceId?:   number,
    @Query('sourceModule') sourceModule?: SourceModule,
    @Query('dateDebut')    dateDebut?:    string,
    @Query('dateFin')      dateFin?:      string,
    @Query('page')         page?:         number,
    @Query('limit')        limit?:        number,
  ) {
    return this.service.search({
      journalId:    journalId    ? +journalId    : undefined,
      exerciceId:   exerciceId   ? +exerciceId   : undefined,
      sourceModule,
      dateDebut,
      dateFin,
      page:  page  ? +page  : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une écriture avec ses lignes" })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get('source/:module/:sourceId')
  @ApiOperation({ summary: 'Écritures liées à un document source (facture, paiement…)' })
  findBySource(
    @Param('module')   sourceModule: SourceModule,
    @Param('sourceId') sourceId:     string,
  ) {
    return this.service.findBySource(sourceModule, sourceId);
  }

  @Post()
  @ApiOperation({ summary: 'Saisie manuelle d\'une écriture' })
  create(@Body() dto: CreateEcritureDto) {
    return this.service.creer(dto, false);
  }
}
