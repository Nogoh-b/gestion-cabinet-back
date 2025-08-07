import { PaginationQueryTxDto } from 'src/core/shared/dto/pagination-query.dto';
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';




import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';





import { PersonnelTypeCode } from '../type_personnel/entities/type_personnel.entity';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { UpdatePersonnelDto } from './dto/update-personnel.dto';
import { Personnel } from './entities/personnel.entity';
import { PersonnelService } from './personnel.service';










@ApiTags('personnel')
@Controller('personnel')
export class PersonnelController {
  constructor(private readonly personnel_service: PersonnelService) {}

  @Post()
  create(@Body() dto: CreatePersonnelDto) {
    return this.personnel_service.create(dto);
  }

  @Get()
  findAll() {
    return this.personnel_service.findAll();
  }
  @Get('non-commercial-partner')
  findAllExceptCommercialAndPartner() {
    return this.personnel_service.findAllExceptCommercialAndPartner();
  }
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.personnel_service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdatePersonnelDto) {
    return this.personnel_service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.personnel_service.remove(id);
  }

  @Get(':code/check')
  @ApiOperation({ summary: 'Détaille un partenaire' })
  @ApiParam({ name: 'code', description: 'ID du partenaire', type: String })
  @ApiResponse({ status: 200, description: 'Partenaire trouvé', type: Personnel })
  @ApiResponse({ status: 404, description: 'Partenaire introuvable' })
  checkPromoCode(@Param('code') code: string, @Query('type_personnel') type_personnel: PersonnelTypeCode) {
      return this.personnel_service.checkCode(code, type_personnel);
  }

  @Get(':id/transactions')
  getTransactions(@Param('id') id: number, @Query() query: PaginationQueryTxDto) {
    const { page, limit, term, fields, exact, from, to, type, txType } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.personnel_service.getPersonnelTransactions(id,query);
  }

  @Post(':id/buyAll')
  unlockIfMaxReached(@Param('id') id: number) {
    return this.personnel_service.unlockIfMaxReached(id);
  }
}
