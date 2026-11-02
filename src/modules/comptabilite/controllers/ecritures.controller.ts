import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { EcrituresService } from '../services/ecritures.service';
import { CreateEcritureDto } from '../dto/create-ecriture.dto';
import { SourceModule } from '../enums/comptabilite.enums';
import { ReverseEcritureDto } from '../dto/reverse-ecriture.dto';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';

@ApiTags('comptabilite-ecritures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/ecritures')
export class EcrituresController {
  constructor(private readonly service: EcrituresService) {}

  @Get()
  @RequirePermissions('view_accounting')
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
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: "Détail d'une écriture avec ses lignes" })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get('source/:module/:sourceId')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Écritures liées à un document source (facture, paiement…)' })
  findBySource(
    @Param('module')   sourceModule: SourceModule,
    @Param('sourceId') sourceId:     string,
  ) {
    return this.service.findBySource(sourceModule, sourceId);
  }

  @Post()
  @RequirePermissions('create_ecriture')
  @ApiOperation({ summary: 'Saisie manuelle d\'une écriture' })
  create(@Body() dto: CreateEcritureDto) {
    return this.service.creer(dto, false);
  }

  @Post(':id/post')
  @RequirePermissions('edit_ecriture')
  @ApiOperation({ summary: 'Comptabiliser définitivement une écriture brouillon' })
  post(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.poster(id, {
      userId: user?.userId ?? user?.id ?? null,
    });
  }

  @Post(':id/reverse')
  @RequirePermissions('edit_ecriture')
  @ApiOperation({ summary: 'Contrepasser une écriture comptabilisée' })
  reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseEcritureDto,
    @CurrentUser() user: any,
  ) {
    return this.service.contrepasser(id, dto.raison, {
      userId: user?.userId ?? user?.id ?? null,
    });
  }
}
