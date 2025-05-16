import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TypeSavingsAccountService } from './type-savings-account.service';
import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';

@Controller('type-savings-account')
export class TypeSavingsAccountController {
  constructor(private readonly typeSavingsAccountService: TypeSavingsAccountService) {}

  @Post()
  create(@Body() createTypeSavingsAccountDto: CreateTypeSavingsAccountDto) {
    return this.typeSavingsAccountService.create(createTypeSavingsAccountDto);
  }

  @Get()
  findAll() {
    return this.typeSavingsAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeSavingsAccountService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTypeSavingsAccountDto: UpdateTypeSavingsAccountDto) {
    return this.typeSavingsAccountService.update(+id, updateTypeSavingsAccountDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.typeSavingsAccountService.remove(+id);
  }
}
