import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateInterestSavingAccountDto } from './dto/create-interest-saving-account.dto';
import { UpdateInterestSavingAccountDto } from './dto/update-interest-saving-account.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InterestSavingAccountResponseDto } from './dto/response-interest-saving-account.dto';

@ApiTags('Interest Saving Accounts')
@Controller('interest-saving-account')
export class InterestSavingAccountController {
  @Get()
  @ApiOperation({ summary: 'Liste tous les taux d’intérêt' })
  @ApiResponse({ status: 200, type: [InterestSavingAccountResponseDto] })
  findAll(): InterestSavingAccountResponseDto[] { return []; }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un taux d’intérêt' })
  @ApiResponse({ status: 200, type: InterestSavingAccountResponseDto })
  findOne(@Param('id') id: number): InterestSavingAccountResponseDto { return new InterestSavingAccountResponseDto; }

  @Post()
  @ApiOperation({ summary: 'Crée un taux d’intérêt' })
  @ApiResponse({ status: 201, type: InterestSavingAccountResponseDto })
  create(@Body() dto: CreateInterestSavingAccountDto): InterestSavingAccountResponseDto { return new InterestSavingAccountResponseDto; }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour un taux d’intérêt' })
  @ApiResponse({ status: 200, type: InterestSavingAccountResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateInterestSavingAccountDto): InterestSavingAccountResponseDto { return new InterestSavingAccountResponseDto; }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un taux d’intérêt' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: number): void {}
}