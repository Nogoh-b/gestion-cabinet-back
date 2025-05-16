import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InterestSavingAccountService } from './interest-saving-account.service';
import { CreateInterestSavingAccountDto } from './dto/create-interest-saving-account.dto';
import { UpdateInterestSavingAccountDto } from './dto/update-interest-saving-account.dto';

@Controller('interest-saving-account')
export class InterestSavingAccountController {
  constructor(private readonly interestSavingAccountService: InterestSavingAccountService) {}

  @Post()
  create(@Body() createInterestSavingAccountDto: CreateInterestSavingAccountDto) {
    return this.interestSavingAccountService.create(createInterestSavingAccountDto);
  }

  @Get()
  findAll() {
    return this.interestSavingAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.interestSavingAccountService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInterestSavingAccountDto: UpdateInterestSavingAccountDto) {
    return this.interestSavingAccountService.update(+id, updateInterestSavingAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.interestSavingAccountService.remove(+id);
  }
}
