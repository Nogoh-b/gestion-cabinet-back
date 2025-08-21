import { Body, Controller, Delete, ForbiddenException, Get, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { TypeCredit } from '../../type_credit/entities/typeCredit.entity';
import { TypeGuaranty } from './entity/type_guaranty.entity';
import { TypeGuarantyService } from './type_guaranty.service';
import { TypeGuarantyDto } from './dto/type_guaranty.dto';

@Controller('type-guaranty')
export class TypeGuarantyController {
  constructor(private readonly typeGuarantyService: TypeGuarantyService) {}
  @Post('')
  async create(@Body() data: TypeGuarantyDto) {
    return await this.typeGuarantyService.addTypeGuaranty(data);
  }

  @Get('all')
  async findAllTypeOfGuaranty() {
    return await this.typeGuarantyService.findAllTypeGuaranty();
  }

  @Delete(':id')
  async deleteTypeOfGuaranty(@Param('id') id: number) {
    const result = await this.typeGuarantyService.findOneTypeGuaranty(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyService.deleteTypeGuaranty(id);
  }

  @Put(':id')
  async updateTypeOfGuaranty(
    @Param('id') id: number,
    @Body() data: Partial<TypeGuarantyDto>,
  ) {
    const result = await this.typeGuarantyService.findOneTypeGuaranty(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyService.updateTypeGuaranty(id, data);
  }
}
