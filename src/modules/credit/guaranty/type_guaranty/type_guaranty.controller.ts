import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param, ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { TypeCredit } from '../../type_credit/entities/typeCredit.entity';
import { TypeGuaranty } from './entity/type_guaranty.entity';
import { TypeGuarantyService } from './type_guaranty.service';
import { TypeGuarantyDto, UpdateTypeGuaranty } from './dto/type_guaranty.dto';
import { DocumentTypeService } from '../../../documents/document-type/document-type.service';

@Controller('type-guaranty')
export class TypeGuarantyController {
  constructor(
    private readonly typeGuarantyService: TypeGuarantyService,
    private readonly documentTypeService: DocumentTypeService,
  ) {}
  @Post(':documentTypeId')
  async create(
    @Param('documentTypeId', ParseIntPipe) documentTypeId: number,
    @Body() data: TypeGuarantyDto,
  ) {
    const typeOfDocument =
      await this.documentTypeService.findOne(documentTypeId);
    const typeGuaranty = await this.typeGuarantyService.addTypeGuaranty({
      ...data,
      typeOfDocument,
    } as TypeGuaranty);
    if (typeGuaranty.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...typeGuaranty,
      });
    return typeGuaranty;
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
    @Body() data: UpdateTypeGuaranty,
  ) {
    const result = await this.typeGuarantyService.findOneTypeGuaranty(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyService.updateTypeGuaranty(id, data);
  }
}
