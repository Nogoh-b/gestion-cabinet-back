import { SearchQueryDto } from 'src/core/shared/dto/advanced-search.dto';
import { VerifyOtpDto } from 'src/core/shared/dto/otp.dto';

import { PaginationQueryDto, PaginationQueryTxDto } from 'src/core/shared/dto/pagination-query.dto';


import { CreateRessourceDto } from 'src/modules/ressource/ressource/dto/create-ressource.dto';
import { Controller, Get, Post, Put, Patch, Param, Body, ParseIntPipe, Query, NotFoundException } from '@nestjs/common';








import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';




































import { AssignInterestRangeDto, CheckInitTxParamDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateCodeCahOfSavingAccountDto, UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { SavingsAccountHasInterest } from './entities/account-has-interest.entity';
import { SavingsAccount } from './entities/savings-account.entity';
import { SavingsAccountService } from './savings-account.service';



























@ApiTags('Saving Accounts')
@Controller('savings-accounts')
export class SavingsAccountController {
  constructor(private readonly service: SavingsAccountService) {}

  /*@ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })  
  @Get(':id/get-code-cash')
  async processData(@Param('id', ParseIntPipe) id: number) {
    return this.service.updateCodeCash(id);
  }*/


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

  @Get('update-has-init-all')
  @ApiOperation({ summary: 'Met ajour les has_init' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  updateAllHasInitTransaction() {
    return this.service.updateAllHasInitTransaction();
  } 
  
   
  @Get('find_all_acccount_not_have_init_trans')
  @ApiOperation({ summary: '' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  findAccountsMissingMinBalanceButWithValidatedTx() {
    return this.service.findAccountsMissingMinBalanceButWithValidatedTx();
  }

  @Get('init_all_acccount_not_have_init_trans')
  @ApiOperation({ summary: '' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  initAccountsMissingMinBalanceButWithValidatedTx() {
    return this.service.initAccountsMissingMinBalanceButWithValidatedTx();
  }

  @Get(':id/documents/status')
  @ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getDocumentStatuses(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDocumentStatuses(id)
  }
  @Get(':id/documents/stats')
  @ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getDocumentStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDocumentStatus(id)
  }

    
  @Get(':id/check-status')
  @ApiOperation({ summary: 'Verifier si le compte est actif' })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  checkStatuts(
    @Param('id') id: number,
  ) {
    return this.service.validateAccount(id);
  }    
  @Get(':code/check-status-by-code')
  @ApiOperation({ summary: 'Verifier si le compte est actif' })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  async checkStatutsByCode(
    @Param('code') code: string,
  ) {
    const sa = await this.service.findOneByCodeV1(code)
    if(!sa) throw new NotFoundException(`Account with code ${code} not found`)
    return this.service.validateAccount(sa.id);
  }

  @Get(':code/transactions-v2')
  @ApiOperation({ summary: 'Get all transactions savings account' })
  @ApiParam({ name: 'code', description: 'Savings account code', type: String })
  // @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentcode: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  async getTransactionsPaginateV2(@Param('code') code: string, @Query() query: PaginationQueryTxDto) {
    const { page, limit, term, fields, exact, from, to, type,txType } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    const sa = await this.findOneByCode(code)
    query.id =sa.id
    return this.service.getTransactionsPaginateV2(sa.id,
      +page, 
      +limit,       
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,
      query);
  }
  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get all transactions savings account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number }) 
  // @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getTransactionsPaginate(@Param('id', ParseIntPipe) id: number, @Query() query: PaginationQueryTxDto) {
    const { page, limit, term, fields, exact, from, to, type,txType, status } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.service.getTransactionsPaginate(id,+page, +limit,       term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,txType,type,undefined,status);
  }
  @Get(':code/transactions-by-code')
  @ApiOperation({ summary: 'Get all transactions savings account By code' })
  @ApiParam({ name: 'code', description: 'Savings account ID', type: String })
  // @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  async getTransactionsPaginateByCode(@Param('code') code: string, @Query() query: PaginationQueryTxDto) {
    const sa = await this.service.findOneByCodeV1(code)
    return this.getTransactionsPaginate(sa.id,query)
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
    return this.service.findOne(id, false);
  }

  @Get('by-code/:number_savings_account')
  @ApiOperation({ summary: 'Récupère un compte d’épargne par CODE et agence' })
  @ApiParam({ name: 'number_savings_account', description: "CODE du compte", type: String })
  @ApiResponse({ status: 200, description: 'Compte trouvé', type: SavingsAccount })
  findOneByCode(
    @Param('number_savings_account') number_savings_account: string,
  ) {
    return this.service.findOneByCode(number_savings_account, false);
  }

  /*@Get('find_all_acccount_not_have_init_trans')
  findAccountsMissingMinBalanceButWithValidatedTx(
  ) {
    return this.service.findAccountsMissingMinBalanceButWithValidatedTx();
  }*/

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  @ApiQuery({ name: 'commercial_code', required: false, type: String })
  @ApiQuery({ name: 'promo_code', required: false, type: String })
  create(
    @Body() dto: CreateSavingsAccountDto,
    @Query('commercial_code') commercial_code?: string,
    @Query('promo_code') promo_code?: string,
  ) {
    dto.commercial_code = commercial_code
    dto.promo_code = promo_code
    return this.service.create(dto);
  }

  @Post('online')
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  createOnline(
    @Body() dto: CreateSavingsAccountDto,
    @Query('commercial_code') commercial_code?: string,
    @Query('promo_code') promo_code?: string,
  ) {
    dto.commercial_code = commercial_code
    dto.promo_code = promo_code
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

  @Get(':id/upadate-code-cash/:code_cash')
  @ApiOperation({ summary: 'Remplace entièrement un compte existant' })
  @ApiParam({ name: 'id', description: "ID du compte", type: Number })
  @ApiBody({ type: UpdateCodeCahOfSavingAccountDto })
  @ApiResponse({ status: 200, description: 'Compte mis à jour', type: SavingsAccount })
  updateCodeCash(
    @Param('id', ParseIntPipe) id: number,
    @Param('code_cash') code_cash: number,
    @Body() dto: UpdateCodeCahOfSavingAccountDto,
  ) {
    return this.service.updateCodeCash(id, code_cash);
  }

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

  @Get('update-has-init-all')
  @ApiOperation({ summary: 'Met ajour les has_init' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  updateAllHasInitTransaction() {
    return this.service.updateAllHasInitTransaction();
  } 

  @Get(':code/request-link')
  requestLink( @Param('code') code: string) {
    
    return this.service.requestLink(code);
  }

  @Post('validate-link-account')
  validateLinkaccount(  @Body() dto: VerifyOtpDto) {
    console.log(dto)
    return this.service.validateRequestLinkAccount( dto);
  }

  @Get(':id/stats')
  stats( @Param('id', ParseIntPipe) id: number) {
    return this.service.stats(id);
  }

  @Get(':code/check-init-transaction')
  checkInitTransaction( @Param('code') code: string, @Query() query: CheckInitTxParamDto) {
    return this.service.checkInitTransaction(code, query);
  }

  @Get(':code/check-init-transaction-projet-epargne')
  checkInitTransactionProjetEpargne( @Param('code') code: string, @Query() query: CheckInitTxParamDto) {
    return this.service.checkInitTransactionProjetEpargne(code, query);
  }

  @Get(':code/stats-v1')
  statsV1( @Param('code') code: string, @Query() query: PaginationQueryTxDto) {
    return this.service.statsV1(code, query);
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

  
  @Get(':id/balances')
  async avalaibleBalances( @Param('id', ParseIntPipe) id: number) {
    return (await this.service.balanceV1(id));
  }
  
  @Get(':id/balance')
  async avalaibleBalance( @Param('id', ParseIntPipe) id: number) {
    return (await this.service.balanceV1(id)).total;
  }

  @Get(':id/avalaible-balance')
  balance( @Param('id', ParseIntPipe) id: number) {
    return this.service.avalaibleBalanceV1(id);
  }

  
  @Get('by-code/:code/balance')
  async balanceByCode( @Param('code') code: string) {
    const sa = await this.findOneByCode(code)
    return (await this.service.balanceV1(sa.id)).total;
  }  

  @Get('by-code/:code/balances')
  async balancesByCode( @Param('code') code: string) {
    const sa = await this.findOneByCode(code)
    return (await this.service.balanceV1(sa.id));
  }

  @Get('by-code/:code/avalaible-balance')
  async avalaibleBalanceByCode( @Param('code') code: string) {
    const sa = await this.findOneByCode(code)
    return (await this.service.balanceV1(sa.id)).available;
  }

  @Get('by-code/:code/avalaible-balance-v2')
  balanceByCodeV2( @Param('code') code: string, @Query() query: PaginationQueryTxDto) {
    return this.service.avalaibleBalanceByCodeV2(code , query);
  }
  @Get('by-code/:code/avalaible-balance-online')
  async balanceByCodeOnline( @Param('code') code: string) {
    const sa = await this.findOneByCode(code)
    return (await this.service.balanceV1(sa.id)).online;
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
  
  @Post(':id/subscribe-ressource-type/:ressourceTypeId')
  @ApiOperation({ summary: 'Souscrire un compte épargne à un type de ressource' })
  @ApiResponse({ status: 201, description: 'Ressource créée avec succès' })
  async subscribeRessourceType(
    @Param('id') savings_account_id: string,
    @Body() dto:       CreateRessourceDto,
    @Param('ressourceTypeId') ressource_type_id: string,
    // @Query() channel: string = 'BRANCH',
  ) {
    dto.savings_account_id = +savings_account_id;
    dto.ressource_type_id = +ressource_type_id;
    // dto.channel = channel;
    return await this.service.subscribeRessourceType(+savings_account_id, dto);
  }
  @Get(':id/ressources')
  @ApiOperation({ summary: 'Lister les ressources liées à un compte épargne' })
  async getRessourcesBySavingsAccount(@Param('id') id: string) {
    return await this.service.getBySavingsAccountId(+id);
  }
  @Get(':id/ressources/:ressourceId')
  @ApiOperation({ summary: 'Récupérer une ressource liée à un compte épargne par ID' })
  async getSingleRessourceBySavingsAccount(
    @Param('id') savings_account_id: string,
    @Param('ressourceId') ressource_id: string,
  ) {
    return await this.service.getByIdAndSavingsAccount(+ressource_id);
  }


  /*@Post(':id/subscribe-ressource/:ressourceTypeId')
  @ApiOperation({ summary: 'Souscrire à une ressource depuis un compte épargne' })
  @ApiResponse({ status: 201, description: 'Ressource souscrite avec succès' })
  async subscribeToRessource(

  ) {
    return await this.service.subscribeFromSavingsAccount(dto);
  }*/


    /*@Get('partner/:promo_code')
    async getByPartner(
    @Param('promo_code') promo_code: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ) {
    return this.service.findByPartnerAndDate(
      promo_code,
      new Date(start_date),
      new Date(end_date),
    );
  }*/


}