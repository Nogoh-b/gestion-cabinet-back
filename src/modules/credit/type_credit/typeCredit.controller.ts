import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TypeCreditDto } from './dto/typeCredit.dto';

@Controller('type-credit')
export class TypeCreditController {
  constructor() {}

  @Get('')
  async findAllTypeCredits(){}

  @Get(':id')
  async findOneTypeCredit(@Param('id') id: string) {}

  @Post('add')
  async createTypeCredit(@Body() credit: TypeCreditDto){}

  @Post(':typeCreditId')
  async activeTypeCredit(@Body() credit: TypeCreditDto){}
}
