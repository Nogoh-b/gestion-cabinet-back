// src/commercial/commercial.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CommercialService } from './commercial.service';
import { CreateCommercialDto } from './dto/create-commercial.dto';
import { Commercial } from './entities/commercial.entity';

@ApiTags('commercials')
@Controller('commercials')
export class CommercialController {
  constructor(private readonly commercialService: CommercialService) {}

  @Post()
  @ApiOperation({ summary: 'Crée un commercial' })
  @ApiResponse({
    status: 201,
    description: 'Commercial créé',
    type: Commercial,
  })
  create(@Body() dto: CreateCommercialDto) {
    return this.commercialService.createCommercial(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste tous les commerciaux' })
  @ApiResponse({
    status: 200,
    description: 'Tableau des commerciaux',
    type: [Commercial],
  })
  findAll() {
    return this.commercialService.getAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détaille un commercial' })
  @ApiParam({ name: 'id', description: 'ID du commercial', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Commercial trouvé',
    type: Commercial,
  })
  @ApiResponse({ status: 404, description: 'Commercial introuvable' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.commercialService.getById(id);
  }
}
