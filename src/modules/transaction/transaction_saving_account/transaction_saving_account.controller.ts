import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from './transaction_saving_account.service';
import { UpdateTransactionSavingsAccountDto } from './dto/update-transaction_saving_account.dto';

@Controller('transaction-saving-account')
export class TransactionSavingAccountController {
  constructor(private readonly transactionSavingAccountService: TransactionSavingsAccountService) {}

  @Post()
  create(@Body() createTransactionSavingAccountDto: CreateTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.create(createTransactionSavingAccountDto);
  }

  @Get()
  findAll() {
    return this.transactionSavingAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionSavingAccountService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTransactionSavingAccountDto: UpdateTransactionSavingsAccountDto) {
    return this.transactionSavingAccountService.update(+id, updateTransactionSavingAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactionSavingAccountService.remove(+id);
  }
}
