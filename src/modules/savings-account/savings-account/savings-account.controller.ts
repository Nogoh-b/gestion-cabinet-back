import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AddInterestRateToSavingAccountDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateInterestRateOfSavingAccountDto, UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SavingAccountInterestAssignmentResponseDto, SavingsAccountResponseDto } from './dto/response-savings-account.dto';

@ApiTags('Savings Accounts')
@Controller('saving-account')
export class SavingsAccountController {
  @Get()
  @ApiOperation({ summary: 'Liste tous les comptes épargne' })
  @ApiResponse({ status: 200, type: [SavingsAccountResponseDto] })
  findAll(): SavingsAccountResponseDto[] { return []; }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un compte épargne' })
  @ApiResponse({ status: 200, type: SavingsAccountResponseDto })
  findOne(@Param('id') id: number): SavingsAccountResponseDto { return new SavingsAccountResponseDto; }

  @Post()
  @ApiOperation({ summary: 'Crée un compte épargne' })
  @ApiResponse({ status: 201, type: SavingsAccountResponseDto })
  create(@Body() dto: CreateSavingsAccountDto): SavingsAccountResponseDto { return new SavingsAccountResponseDto; }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour un compte épargne' })
  @ApiResponse({ status: 200, type: SavingsAccountResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateSavingsAccountDto): SavingsAccountResponseDto { return new SavingsAccountResponseDto; }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un compte épargne' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: number): void {}

  @Get(':id/interest-rates')
  @ApiOperation({ summary: 'Liste les taux d’intérêt associés' })
  @ApiResponse({ status: 200, type: [SavingAccountInterestAssignmentResponseDto] })
  findRates(@Param('id') id: number): SavingAccountInterestAssignmentResponseDto[] { return []; }

  @Post(':id/interest-rates')
  @ApiOperation({ summary: 'Assigne un taux d’intérêt au compte' })
  @ApiResponse({ status: 201 })
  addRate(@Param('id') id: number, @Body() dto: AddInterestRateToSavingAccountDto): void {}

  @Patch(':id/interest-rates/:interestId')
  @ApiOperation({ summary: 'Met à jour une affectation de taux' })
  @ApiResponse({ status: 200 })
  updateRate(@Param('id') id: number, @Param('interestId') interestId: number, @Body() dto: UpdateInterestRateOfSavingAccountDto): void {}

  @Delete(':id/interest-rates/:interestId')
  @ApiOperation({ summary: 'Retire un taux d’intérêt associé' })
  @ApiResponse({ status: 204 })
  removeRate(@Param('id') id: number, @Param('interestId') interestId: number): void {}
}
