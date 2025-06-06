import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';

import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from './transaction_saving_account.service';


@Controller('transaction-saving-account')
export class TransactionSavingAccountController {
  constructor(private readonly transactionSavingAccountService: TransactionSavingsAccountService) {}

 @Post('deposit_cash')
  deposit_cash(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.deposit_cash(dto);
  }

  @Post('withdraw_cash')
  withdraw_cash(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.withdraw_cash(dto);
  }

  @Post('deposit_cheque')
  deposit_cheque(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.deposit_cheque(dto);
  }

  @Post('credit_interest')
  credit_interest(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.credit_interest(dto);
  }

  @Post('e_wallet_deposit')
  e_wallet_deposit(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.e_wallet_deposit(dto);
  }

  @Post('e_wallet_withdrawal')
  e_wallet_withdrawal(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.e_wallet_withdrawal(dto);
  }

  @Post('internal_transfer')
  internal_transfer(
    @Body() dto: CreateTransactionSavingsAccountDto,
  ) {
    return this.transactionSavingAccountService.internal_transfer(dto);
  }




  @Get()
  findAll() {
    return this.transactionSavingAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionSavingAccountService.findOne(+id);
  }

  @Delete(':id')
  validate(@Param('id') id: string) {
    return this.transactionSavingAccountService.validate(+id);
  }
}
