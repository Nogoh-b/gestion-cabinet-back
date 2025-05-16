import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SavingsAccountService } from './savings-account.service';
import { CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';

@Controller('savings-account')
export class SavingsAccountController {
  constructor(private readonly savingsAccountService: SavingsAccountService) {}

  @Post()
  create(@Body() createSavingsAccountDto: CreateSavingsAccountDto) {
    return this.savingsAccountService.create(createSavingsAccountDto);
  }

  @Get()
  findAll() {
    return this.savingsAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.savingsAccountService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSavingsAccountDto: UpdateSavingsAccountDto) {
    return this.savingsAccountService.update(+id, updateSavingsAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.savingsAccountService.remove(+id);
  }
}
