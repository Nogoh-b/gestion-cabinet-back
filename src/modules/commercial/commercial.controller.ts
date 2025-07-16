// src/commercial/commercial.controller.ts
import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  Param, Patch,
  Query
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';




import { SavingsAccount } from '../savings-account/savings-account/entities/savings-account.entity';
import { TransactionSavingsAccount } from '../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { CommercialService } from './commercial.service';
import { CreateCommercialDto } from './dto/create-commercial.dto';
import { UpdateCommercialStatusDto } from './dto/update-commercial.dto';
import { Commercial } from './entities/commercial.entity';





@ApiTags('commercials')
@Controller('commercials')
export class CommercialController {
  constructor(private readonly commercialService: CommercialService) {}

      @Post()
      @ApiOperation({ summary: 'Crée un commercial' })
      @ApiResponse({ status: 201, description: 'Commercial créé', type: Commercial })
      create(@Body() dto: CreateCommercialDto) {
      return this.commercialService.createCommercial(dto);
      }
  
      @Get()
      @ApiOperation({ summary: 'Liste tous les commercials' })
      @ApiResponse({ status: 200, description: 'Tableau des commercials', type: [Commercial] })
      findAll(@Query() query: PaginationQueryDto) {
          const { page, limit, term, fields, exact, from, to } = query;
          const fieldList = fields ? fields.split(',') : undefined;
          const isExact = exact ;
          return this.commercialService.getAll(
          false,
          page ? +page : undefined,
          limit ? +limit : undefined,
          term,
          fieldList,
          isExact,
          from ? new Date(from).toISOString() : undefined,
          to ? new Date(to).toISOString() : undefined);
      }
  
      @Get('deactivated')
      @ApiOperation({ summary: 'Liste tous les commercials' })
      @ApiResponse({ status: 200, description: 'Tableau des commercials', type: [Commercial] })
      findAllDeactivated(@Query() query: PaginationQueryDto) {
          const { page, limit, term, fields, exact, from, to } = query;
          const fieldList = fields ? fields.split(',') : undefined;
          const isExact = exact ;
          return this.commercialService.getAll(
          true,
          page ? +page : undefined,
          limit ? +limit : undefined,
          term,
          fieldList,
          isExact,
          from ? new Date(from).toISOString() : undefined,
          to ? new Date(to).toISOString() : undefined);
      }
  
          /*@Get(':commercial_code')
          @ApiOperation({ summary: 'Détaille un commercial' })
          @ApiParam({ name: 'commercial_code', description: 'commercial_code du commercial', type: Number })
          @ApiResponse({ status: 200, description: 'Commercial trouvé', type: Commercial })
          @ApiResponse({ status: 404, description: 'Commercial introuvable' })
          findOne(@Param('commercial_code') commercial_code: string) {
          return this.commercialService.getById(commercial_code);
          }*/
  
      @Get(':commercial_code')
      @ApiOperation({ summary: 'Détaille un commercial' })
      @ApiParam({ name: 'commercial_code', description: 'ID du commercial', type: String })
      @ApiResponse({ status: 200, description: 'Commercial trouvé', type: Commercial })
      @ApiResponse({ status: 404, description: 'Commercial introuvable' })
      findOneByCode(@Param('commercial_code') commercial_code: string) {
        return this.commercialService.getByCode(commercial_code);
      }  

      @Get(':commercial_code/buy-all')
      @ApiOperation({ summary: 'Détaille un commercial' })
      @ApiParam({ name: 'commercial_code', description: 'ID du commercial', type: String })
      @ApiResponse({ status: 200, description: 'Commercial trouvé', type: Commercial })
      @ApiResponse({ status: 404, description: 'Commercial introuvable' })
      buyAll(@Param('commercial_code') commercial_code: string) {
        return this.commercialService.buyAll(commercial_code);
      }
  
      @Patch(':commercial_code/status')
      @ApiOperation({ summary: 'Active ou désactive un commercial' })
      @ApiParam({ name: 'commercial_code', description: 'ID du commercial', type: String })
      @ApiResponse({ status: 200, description: 'Commercial mis à jour', type: Commercial })
      updateStatus(
          @Param('commercial_code') commercial_code: string,
          @Body() dto: UpdateCommercialStatusDto,
      ): Promise<Commercial  | null> {
          return this.commercialService.updateStatus(commercial_code, dto.status);
      }
  
      @Get(':commercial_code/savings-accounts')
      @ApiOperation({ summary: 'Liste les comptes épargne d’un commercial' })
      @ApiParam({ name: 'commercial_code', description: 'commercial_code du commercial', type: String })
      @ApiQuery({ name: 'start_date', description: 'Date début (YYYY-MM-DD)', required: false, example: '2025-01-01' })
      @ApiQuery({ name: 'end_date', description: 'Date fin (YYYY-MM-DD)', required: false, example: '2025-07-12' })
      @ApiResponse({ status: 200, description: 'Liste des comptes épargne', type: [SavingsAccount] })
      getSavingsAccounts(
          @Param('commercial_code') commercial_code: number,
          @Query() query: PaginationQueryDto
      ): Promise<any> {
          const { page, limit, term, fields, exact, from, to } = query;
          const fieldList = fields ? fields.split(',') : undefined;
          const isExact = exact ;
          return this.commercialService.getSavingsAccountsByCommercial(
          page ? +page : undefined,
          limit ? +limit : undefined,
          term,
          fieldList,
          isExact,
          from ? new Date(from).toISOString() : undefined,
          to ? new Date(to).toISOString() : undefined, commercial_code);
  
      }
  
      @Get(':code/transactions')
      @ApiOperation({ summary: 'Liste les transactions perçues pour un code promo' })
      @ApiParam({ name: 'code', description: 'Code promo du commercial', type: String })
      @ApiQuery({ name: 'start_date', description: 'Date début (YYYY-MM-DD)', required: false, example: '2025-01-01' })
      @ApiQuery({ name: 'end_date', description: 'Date fin (YYYY-MM-DD)', required: false, example: '2025-07-12' })
      @ApiResponse({ status: 200, description: 'Liste des transactions', type: [TransactionSavingsAccount] })
      getTransactionsByCode(
          @Param('code') code: string,
      @Query() query: PaginationQueryDto
      ): Promise<any> {
              const { page, limit, term, fields, exact, from, to } = query;
          const fieldList = fields ? fields.split(',') : undefined;
          const isExact = exact ;
          return this.commercialService.getTransactionsByCode(
          page ? +page : undefined,
          limit ? +limit : undefined,
          term,
          fieldList,
          isExact,
          from ? new Date(from).toISOString() : undefined,
          to ? new Date(to).toISOString() : undefined, code)
          
      }

      
}
