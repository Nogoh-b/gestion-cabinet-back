import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { CreateEcritureDto } from '../dto/create-ecriture.dto';
import { SourceModule } from '../enums/comptabilite.enums';
import { EcrituresService } from '../services/ecritures.service';

@ApiTags('comptabilite-ecritures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/ecritures')
export class EcrituresController {
  constructor(private readonly service: EcrituresService) {}

  @Get()
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Liste et filtre les ecritures comptables' })
  @ApiQuery({ name: 'journalId', required: false })
  @ApiQuery({ name: 'exerciceId', required: false })
  @ApiQuery({ name: 'sourceModule', required: false, enum: SourceModule })
  @ApiQuery({ name: 'dateDebut', required: false })
  @ApiQuery({ name: 'dateFin', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  search(
    @Query('journalId') journalId?: number,
    @Query('exerciceId') exerciceId?: number,
    @Query('sourceModule') sourceModule?: SourceModule,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.search({
      journalId: journalId ? +journalId : undefined,
      exerciceId: exerciceId ? +exerciceId : undefined,
      sourceModule,
      dateDebut,
      dateFin,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get('source/:module/:sourceId')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Ecritures liees a un document source' })
  findBySource(
    @Param('module') sourceModule: SourceModule,
    @Param('sourceId') sourceId: string,
  ) {
    return this.service.findBySource(sourceModule, sourceId);
  }

  @Get(':id')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: "Detail d'une ecriture avec ses lignes" })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('create_ecriture')
  @ApiOperation({ summary: "Saisie manuelle d'une ecriture" })
  create(@Body() dto: CreateEcritureDto) {
    return this.service.creer(dto, false);
  }
}
