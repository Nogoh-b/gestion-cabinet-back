import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CommissionResponseDto } from './dto/response-commission.dto';

@ApiTags('Commissions')
@Controller('commission')
export class CommissionController {
  @Get()
  @ApiOperation({ summary: 'Liste toutes les commissions' })
  @ApiResponse({ status: 200, type: [CommissionResponseDto] })
  findAll(): CommissionResponseDto[] { return []; }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une commission' })
  @ApiResponse({ status: 200, type: CommissionResponseDto })
  findOne(@Param('id') id: number): CommissionResponseDto { return new CommissionResponseDto; }

  @Post()
  @ApiOperation({ summary: 'Crée une commission' })
  @ApiResponse({ status: 201, type: CommissionResponseDto })
  create(@Body() dto: CreateCommissionDto): CommissionResponseDto { return new CommissionResponseDto; }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour une commission' })
  @ApiResponse({ status: 200, type: CommissionResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateCommissionDto): CommissionResponseDto { return new CommissionResponseDto; }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime une commission' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: number): void {}
}
