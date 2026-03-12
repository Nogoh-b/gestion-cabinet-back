// src/modules/procedures/procedures.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { ProcedureSearchDto } from './dto/procedure-search.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateProcedureTypeDto } from './dto/create-procedure.dto';
import { ProcedureTypeResponseDto } from './dto/procedure-type-response';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { UpdateProcedureTypeDto } from './dto/update-procedure.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';

@ApiTags('procedures')
@ApiBearerAuth()
@Controller('procedures')
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Créer un nouveau type de procédure' })
  @ApiResponse({ status: 201, description: 'Type de procédure créé', type: ProcedureTypeResponseDto })
  create(@Body() createProcedureTypeDto: CreateProcedureTypeDto): Promise<ProcedureTypeResponseDto> {
    return this.proceduresService.create(createProcedureTypeDto);
  }

    @Get('/search')
    @ApiOperation({ summary: 'Rechercher des procedure avec filtres' })
    @ApiResponse({ status: 200, type: [ProcedureTypeResponseDto] })
    async search(
      @Query() searchParams?: ProcedureSearchDto,
      @Query() paginationParams?: PaginationParamsDto,
    ) {
      return await this.proceduresService.searchWithTransformer(
        searchParams as SearchCriteria,
        ProcedureTypeResponseDto,
        paginationParams,
      );
    }
  

  @Post(':id/subtypes')
  @UseGuards(JwtAuthGuard)
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Créer un sous-type de procédure' })
  @ApiResponse({ status: 201, description: 'Sous-type créé', type: ProcedureTypeResponseDto })
  createSubtype(
    @Param('id', ParseIntPipe) id: string,
    @Body() createProcedureTypeDto: CreateProcedureTypeDto
  ): Promise<ProcedureTypeResponseDto> {
    return this.proceduresService.createSubtype(+id, createProcedureTypeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de procédure' })
  @ApiResponse({ status: 200, description: 'Liste des types de procédure', type: [ProcedureTypeResponseDto] })
  findAll(@Query() searchDto: ProcedureSearchDto): Promise<ProcedureTypeResponseDto[]> {
    return this.proceduresService.findAll(searchDto);
  }

  @Get('main-types')
  @ApiOperation({ summary: 'Lister les types de procédure principaux' })
  @ApiResponse({ status: 200, description: 'Liste des types principaux', type: [ProcedureTypeResponseDto] })
  getMainTypes(): Promise<ProcedureTypeResponseDto[]> {
    return this.proceduresService.getMainTypes();
  }

  @Get(':id/subtypes')
  @ApiOperation({ summary: 'Lister les sous-types d\'un type de procédure' })
  @ApiResponse({ status: 200, description: 'Liste des sous-types', type: [ProcedureTypeResponseDto] })
  getSubtypes(@Param('id', ParseIntPipe) id: string): Promise<ProcedureTypeResponseDto[]> {
    return this.proceduresService.getSubtypes(+id);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Obtenir les statistiques des procédures' })
  @ApiResponse({ status: 200, description: 'Statistiques des procédures' })
  getStatistics(): Promise<any> {
    return this.proceduresService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un type de procédure par son ID' })
  @ApiResponse({ status: 200, description: 'Type de procédure trouvé', type: ProcedureTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Type de procédure non trouvé' })
  findOne(@Param('id', ParseIntPipe) id: string): any{
    return this.proceduresService.findOneV1(+id,null,ProcedureTypeResponseDto);
    
  }

  @Patch(':id')
  // @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour un type de procédure' })
  @ApiResponse({ status: 200, description: 'Type de procédure mis à jour', type: ProcedureTypeResponseDto })
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateProcedureTypeDto: UpdateProcedureTypeDto
  ): Promise<ProcedureTypeResponseDto> {
    return this.proceduresService.update(+id, updateProcedureTypeDto);
  }

  @Delete(':id')
  // @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Supprimer un type de procédure' })
  @ApiResponse({ status: 200, description: 'Type de procédure supprimé' })
  remove(@Param('id', ParseIntPipe) id: string): Promise<void> {
    return this.proceduresService.remove(+id);
  }

  @Get('validate/:typeId/:subtypeId')
  @ApiOperation({ summary: 'Valider la correspondance type/sous-type' })
  @ApiResponse({ status: 200, description: 'Validation réussie', type: Boolean })
  validateTypeSubtype(
    @Param('typeId', ParseIntPipe) typeId: string,
    @Param('subtypeId', ParseIntPipe) subtypeId: string
  ): Promise<boolean> {
    return this.proceduresService.validateTypeSubtype(+typeId, +subtypeId);
  }
}