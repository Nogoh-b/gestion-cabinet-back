import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';
import { Controller, Get, Post, Body, Param, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';




import { SavingsAccount } from '../savings-account/savings-account/entities/savings-account.entity';
import { TransactionSavingsAccount } from '../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerStatusDto } from './dto/update-partner.dto';
import { Partner } from './entities/partner.entity';
import { PartnerService } from './partner.service';


@ApiTags('partners')
@Controller('partners')
export class PartnerController {
constructor(private readonly partnerService: PartnerService) {}

    @Post()
    @ApiOperation({ summary: 'Crée un partenaire' })
    @ApiResponse({ status: 201, description: 'Partenaire créé', type: Partner })
    create(@Body() dto: CreatePartnerDto) {
    return this.partnerService.createPartner(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Liste tous les partenaires' })
    @ApiResponse({ status: 200, description: 'Tableau des partenaires', type: [Partner] })
    findAll(@Query() query: PaginationQueryDto) {
        const { page, limit, term, fields, exact, from, to } = query;
        const fieldList = fields ? fields.split(',') : undefined;
        const isExact = exact ;
        return this.partnerService.getAll(
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
    @ApiOperation({ summary: 'Liste tous les partenaires' })
    @ApiResponse({ status: 200, description: 'Tableau des partenaires', type: [Partner] })
    findAllDeactivated(@Query() query: PaginationQueryDto) {
        const { page, limit, term, fields, exact, from, to } = query;
        const fieldList = fields ? fields.split(',') : undefined;
        const isExact = exact ;
        return this.partnerService.getAll(
        true,
        page ? +page : undefined,
        limit ? +limit : undefined,
        term,
        fieldList,
        isExact,
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined);
    }

        /*@Get(':promo_code')
        @ApiOperation({ summary: 'Détaille un partenaire' })
        @ApiParam({ name: 'promo_code', description: 'promo_code du partenaire', type: Number })
        @ApiResponse({ status: 200, description: 'Partenaire trouvé', type: Partner })
        @ApiResponse({ status: 404, description: 'Partenaire introuvable' })
        findOne(@Param('promo_code') promo_code: string) {
        return this.partnerService.getById(promo_code);
        }*/

    @Get(':promo_code')
    @ApiOperation({ summary: 'Détaille un partenaire' })
    @ApiParam({ name: 'promo_code', description: 'ID du partenaire', type: String })
    @ApiResponse({ status: 200, description: 'Partenaire trouvé', type: Partner })
    @ApiResponse({ status: 404, description: 'Partenaire introuvable' })
    findOneByCode(@Param('promo_code') promo_code: string) {
        return this.partnerService.getByCode(promo_code);
    }

    @Get(':promo_code/check')
    @ApiOperation({ summary: 'Détaille un partenaire' })
    @ApiParam({ name: 'promo_code', description: 'ID du partenaire', type: String })
    @ApiResponse({ status: 200, description: 'Partenaire trouvé', type: Partner })
    @ApiResponse({ status: 404, description: 'Partenaire introuvable' })
    checkPromoCode(@Param('promo_code') promo_code: string) {
        return this.partnerService.checkPromoCode(promo_code);
    }

    @Get(':promo_code/buy-all')
    @ApiOperation({ summary: 'paye un partenaire' })
    @ApiParam({ name: 'promo_code', description: 'ID du partenaire', type: String })
    @ApiResponse({ status: 200, description: 'Partner trouvé', type: Partner })
    @ApiResponse({ status: 404, description: 'Partner introuvable' })
    buyAll(@Param('promo_code') promo_code: string) {
        return this.partnerService.buyAll(promo_code);
    }
  
    @Patch(':promo_code/status')
    @ApiOperation({ summary: 'Active ou désactive un partenaire' })
    @ApiParam({ name: 'promo_code', description: 'ID du partenaire', type: String })
    @ApiResponse({ status: 200, description: 'Partenaire mis à jour', type: Partner })
    updateStatus(
        @Param('promo_code') promo_code: string,
        @Body() dto: UpdatePartnerStatusDto,
    ): Promise<Partner  | null> {
        return this.partnerService.updateStatus(promo_code, dto.status);
    }

    @Get(':promo_code/savings-accounts')
    @ApiOperation({ summary: 'Liste les comptes épargne d’un partenaire' })
    @ApiParam({ name: 'promo_code', description: 'promo_code du partenaire', type: String })
    @ApiQuery({ name: 'start_date', description: 'Date début (YYYY-MM-DD)', required: false, example: '2025-01-01' })
    @ApiQuery({ name: 'end_date', description: 'Date fin (YYYY-MM-DD)', required: false, example: '2025-07-12' })
    @ApiResponse({ status: 200, description: 'Liste des comptes épargne', type: [SavingsAccount] })
    getSavingsAccounts(
        @Param('promo_code') promo_code: number,
        @Query() query: PaginationQueryDto
    ): Promise<any> {
        const { page, limit, term, fields, exact, from, to } = query;
        const fieldList = fields ? fields.split(',') : undefined;
        const isExact = exact ;
        return this.partnerService.getSavingsAccountsByPartner(
        page ? +page : undefined,
        limit ? +limit : undefined,
        term,
        fieldList,
        isExact,
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined, promo_code);

    }

    @Get(':code/transactions')
    @ApiOperation({ summary: 'Liste les transactions perçues pour un code promo' })
    @ApiParam({ name: 'code', description: 'Code promo du partenaire', type: String })
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
        return this.partnerService.getTransactionsByCode(
        page ? +page : undefined,
        limit ? +limit : undefined,
        term,
        fieldList,
        isExact,
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined, code)
        
    }
}