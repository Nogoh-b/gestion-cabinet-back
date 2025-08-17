import { Body, Controller, Delete, ForbiddenException, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { TypeCredit } from '../../type_credit/entities/typeCredit.entity';
import { TypeGuaranty } from './entity/type_guaranty.entity';
import { TypeGuarantyService } from './type_guaranty.service';
import { TypeGuarantyDto } from './dto/type_guaranty.dto';

@Controller('type-guaranty')
export class TypeGuarantyController {
  constructor(private readonly typeGuarantyService: TypeGuarantyService) {}
  @Post('')
  async create(@Body() data: TypeGuarantyDto) {
    return {
      data: await this.typeGuarantyService.addTypeGuaranty(data),
      success: true,
      status: HttpStatus.CREATED,
    };
  }

  @Delete(':id')
  async deleteGuaranty(@Param('id') id: number) {
    const result = await this.typeGuarantyService.findOneTypeGuaranty(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      data: await this.typeGuarantyService.deleteTypeGuaranty(id),
      success: true,
      status: HttpStatus.OK,
    };
  }
}
