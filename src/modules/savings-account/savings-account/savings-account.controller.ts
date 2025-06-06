import { Controller, Get, Post, Put, Patch, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

import { AssignInterestRangeDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { SavingsAccountHasInterest } from './entities/account-has-interest.entity';
import { SavingsAccount } from './entities/savings-account.entity';
import { SavingsAccountService } from './savings-account.service';
import { SearchQueryDto } from 'src/core/shared/dto/advanced-search.dto';


@ApiTags('Saving Accounts')
@Controller('savings-accounts')
export class SavingsAccountController {
  constructor(private readonly service: SavingsAccountService) {}

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
  @ApiOperation({ summary: 'Liste tous les comptes en épargne pour une agence' })
  @ApiResponse({ status: 200, description: 'Liste des comptes', type: [SavingsAccount] })
  findAll() {
    return this.service.findAll();
  }


  @Get(':id/documents/status')
  @ApiOperation({ summary: 'Get validation status of all documents for an account' })
  @ApiParam({ name: 'id', description: 'Savings account ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of document statuses', schema: { type: 'array', items: { type: 'object', properties: { documentId: { type: 'number' }, name: { type: 'string' }, status: { type: 'number' } } } } })
  getDocumentStatuses(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDocumentStatuses(id);
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

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau compte d’épargne' })
  @ApiBody({ type: CreateSavingsAccountDto })
  @ApiResponse({ status: 201, description: 'Compte créé', type: SavingsAccount })
  create(
    @Body() dto: CreateSavingsAccountDto,
  ) {
    return this.service.create(dto);
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
    return this.service.unlock(id);
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
