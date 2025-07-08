import { SearchQueryDto } from 'src/core/shared/dto/advanced-search.dto';
import { PaginationQueryDto, PaginationQueryTxDto } from 'src/core/shared/dto/pagination-query.dto';

import { Controller, Get, Post, Put, Patch, Param, Body, ParseIntPipe, Query } from '@nestjs/common';


import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';


import { AssignInterestRangeDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { SavingsAccountHasInterest } from './entities/account-has-interest.entity';
import { SavingsAccount } from './entities/savings-account.entity';
import { SavingsAccountService } from './savings-account.service';



@ApiTags('Saving Accounts')
@Controller('savings-accounts')
export class SavingsAccountController {
  constructor(private readonly service: SavingsAccountService) {}

  @ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })  
  @Get(':id/get-code-cash')
  async processData(@Param('id', ParseIntPipe) id: number) {
    return this.service.updateCodeCash(id);
  }


  async searchUsers(@Query() query: SearchQueryDto) {
    return await this.service.enhancedSearch({
      alias: 'location_city',
      searchTerm: query.term,
      exactMatch: query.exact == 'true',
      skip: Number(query.skip),
      take: Number(query.take),
      orderBy: {
        field: query.orderField,
        direction: query.orderDir,
      },
    });
  }

  @Get()
  @ApiOperation({ summary: 'Liste tous les comptes en épargne' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  findAll(  
    @Query() query: PaginationQueryDto
  ) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.service.findAll(
      false,
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined);
  }
  
  @Get('deactivate-accounts')
  @ApiOperation({ summary: 'Liste tous les comptes en épargne  qui sont desactivé' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  findAllDeactivate() {
    return this.service.findAll(true);
  }


  @Get(':id/documents/status')
  @ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getDocumentStatuses(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDocumentStatuses(id)
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get all transactions savings account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  // @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getTransactionsPaginate(@Param('id', ParseIntPipe) id: number, @Query() query: PaginationQueryTxDto) {
    const { page, limit, term, fields, exact, from, to, type,txType } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.service.getTransactionsPaginate(id,+page, +limit,       term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,txType,type);
  }

  @Get(':id/required-documents')
  @ApiOperation({ summary: 'Recupérér les document requis' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  // @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getRequiredDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRequiredDocuments(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un compte d’épargne par ID et agence' })
  @ApiParam({ name: 'id', description: "ID du compte", type: Number })
  @ApiResponse({ status: 200, description: 'Compte trouvé', type: SavingsAccount })
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(id);
  }

  @Get('by-code/:number_savings_account')
  @ApiOperation({ summary: 'Récupère un compte d’épargne par CODE et agence' })
  @ApiParam({ name: 'number_savings_account', description: "CODE du compte", type: String })
  @ApiResponse({ status: 200, description: 'Compte trouvé', type: SavingsAccount })
  findOneByCode(
    @Param('number_savings_account') number_savings_account: string,
  ) {
    return this.service.findOneByCode(number_savings_account);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  create(
    @Body() dto: CreateSavingsAccountDto,
  ) {
    return this.service.create(dto);
  }

  @Post('online')
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  createOnline(
    @Body() dto: CreateSavingsAccountDto,
  ) {
    return this.service.createOnline(dto);
  }

  @Post('admin')
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne Admin' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  createAdmin(
    @Body() dto: CreateSavingsAccountDto,
  ) {
    return this.service.create(dto, true);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Remplace entièrement un compte existant' })
  @ApiParam({ name: 'id', description: "ID du compte", type: Number })
  @ApiBody({ type: UpdateSavingsAccountDto })
  @ApiResponse({ status: 200, description: 'Compte mis à jour', type: SavingsAccount })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavingsAccountDto,
  ) {
    return this.service.update(id, dto);
  }

  /*@Put(':id')
  @ApiOperation({ summary: 'Remplace entièrement un compte existant' })
  @ApiParam({ name: 'id', description: "ID du compte", type: Number })
  @ApiBody({ type: UpdateCodeCahOfSavingAccountDto })
  @ApiResponse({ status: 200, description: 'Compte mis à jour', type: SavingsAccount })
  updateCodeCash(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCodeCahOfSavingAccountDto,
  ) {
    return this.service.updateCodeCash(id, dto);
  }*/

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour partiellement un compte' })
  @ApiParam({ name: 'id', description: "ID du compte", type: Number })
  @ApiResponse({ status: 200, description: 'Compte partiellement mis à jour', type: SavingsAccount })
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavingsAccountDto,
  ) {
    return this.service.update(id, dto);
  }

  @Get(':id/deactivate')
  remove( @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  
  @Get(':id/activate')
  activate( @Param('id', ParseIntPipe) id: number) {
    return this.service.activate(id);
  }

  
  @Get(':id/lock')
  lock( @Param('id', ParseIntPipe) id: number) {
    return this.service.lock(id);
  }

  
  @Get(':id/unlock')
  unlock( @Param('id', ParseIntPipe) id: number) {
    return this.service.activate(id);
  }

  
  @Get(':id/balance')
  avalaibleBalance( @Param('id', ParseIntPipe) id: number) {
    return this.service.balance(id);
  }

  @Get(':id/avalaible-balance')
  balance( @Param('id', ParseIntPipe) id: number) {
    return this.service.avalaibleBalance(id);
  }

  
  @Get('by-code/:code/balance')
  avalaibleBalanceByCode( @Param('code', ParseIntPipe) code: string) {
    return this.service.balanceByCode(code);
  }

  @Get('by-code/:code/avalaible-balance')
  balanceByCode( @Param('code', ParseIntPipe) code: string) {
    return this.service.avalaibleBalanceByCode(code);
  }

  @Post(':id/interest-range')
  @ApiOperation({ summary: "Attribuer un taux sur une période donnée" })
  @ApiParam({ name: 'id',        type: Number, description: 'ID du compte' })
  @ApiBody({ type: AssignInterestRangeDto })
  @ApiResponse({ status: 201, type: SavingsAccountHasInterest })
  assign_interest_range(
    @Param('id',        ParseIntPipe) id:        number,
    @Body()              dto:       AssignInterestRangeDto,
  ): Promise<SavingsAccountHasInterest> {
    return this.service.assign_interest_range(id, dto);
  }


}