import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';





import { TransactionCode, TransactionProvider } from '../transaction_type/entities/transaction_type.entity';
import { CreateCreditTransactionSavingsAccountDto, CreateDebitTransactionSavingsAccountDto, CreateTransactionSavingsAccountDto, ValidateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from './transaction_saving_account.service';







@Controller('transaction-saving-account')
export class TransactionSavingAccountController {
  constructor(
    private readonly transactionSavingAccountService: TransactionSavingsAccountService,
  ) {}

  @Post('deposit_cash')
  deposit_cash(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.deposit_cash(dto);
  }

  @Post('withdraw_cash')
  withdraw_cash(@Body() dto: CreateDebitTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.withdraw_cash(dto);
  }

  @Post('deposit_cheque')
  deposit_cheque(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.deposit_cheque(dto);
  }

  @Post('momo_deposit')
  momo_deposit(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.momo_deposit(dto);
  }

  @Post('om_deposit')
  om_deposit(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.om_deposit(dto);
  }

  @Post('credit_interest')
  credit_interest(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.credit_interest(dto);
  }

  @Post('e_wallet_deposit')
  e_wallet_deposit(@Body() dto: CreateCreditTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.e_wallet_deposit(dto);
  }

  @Post('e_wallet_withdrawal')
  e_wallet_withdrawal(@Body() dto: CreateDebitTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.e_wallet_withdrawal(dto);
  }

  @Post('internal_transfer')
  internal_transfer(@Body() dto: CreateTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.internal_transfer(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.transactionSavingAccountService.findAll(      
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined);
  }

  @Get('momo')
  findAllMomo(@Query() query: PaginationQueryDto) {
    return this.findByTypeParent(query, TransactionProvider.MOMO)
  }

  @Get('om')
  findAllOM(@Query() query: PaginationQueryDto) {
    return this.findByTypeParent(query, TransactionProvider.OM)
  }

  @Get('wallet_deposit')
  findAllWallet(@Query() query: PaginationQueryDto) {
    return this.findByTypeParent(query, TransactionProvider.WALLET)
  }

  @Get('wallet_withdrawl')
  findAllWalletWin(@Query() query: PaginationQueryDto) {
    return this.findByTypeParent(query, TransactionProvider.WALLET)
  }

  findByTypeParent(query,
    txTypeCode: string){
      const { page, limit, term, fields, exact, from, to } = query;
      const fieldList = fields ? fields.split(',') : undefined;
      const isExact = exact ;
      return this.transactionSavingAccountService.findAllByType(      
        page ? +page : undefined,
        limit ? +limit : undefined,
        term,
        fieldList,
        isExact,
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined,
        txTypeCode);
  }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionSavingAccountService.findOne(+id);
  }

  @Post(':id/validate')
  validate(
    @Param('id') id: string, @Body() dto: ValidateTransactionSavingsAccountDto
  ) {
    return this.transactionSavingAccountService.validate(
      +id,dto
    );
  }

  @Get(':id/unlock')
  unlockTransaction(@Param('id') id: string) {
    return this.transactionSavingAccountService.validate(+id);
  }
}
