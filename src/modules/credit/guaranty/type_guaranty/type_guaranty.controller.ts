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
    return {
      data: await this.typeGuarantyService.addTypeGuaranty(data),
      success: true,
      status: HttpStatus.CREATED,
    };
  }

  @Get('all')
  async findAllTypeOfGuaranty() {
    return {
      data: await this.typeGuarantyService.findAllTypeGuaranty(),
      success: true,
      status: HttpStatus.OK,
    };
  }

  @Delete(':id')
  async deleteTypeOfGuaranty(@Param('id') id: number) {
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
    return {
      data: await this.typeGuarantyService.updateTypeGuaranty(id, data),
      success: true,
      status: HttpStatus.OK,
    };
  }
}
