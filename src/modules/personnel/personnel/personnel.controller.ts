import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import {
  PaginationQueryDto,
  PaginationQueryTxDto,
} from 'src/core/shared/dto/pagination-query.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PersonnelTypeCode } from '../type_personnel/entities/type_personnel.entity';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { UpdatePersonnelDto } from './dto/update-personnel.dto';
import { Personnel } from './entities/personnel.entity';
import { PersonnelService } from './personnel.service';

@ApiTags('personnel')
@Controller('personnel')
@ApiBearerAuth()
export class PersonnelController {
  constructor(private readonly personnel_service: PersonnelService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('CREATE_PERSONNEL')
  create(@Body() dto: CreatePersonnelDto) {
    return this.personnel_service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact;
    return this.personnel_service.findAll(
      query.status,
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,
    );
  }
  @Get('non-commercial-partner')
  findAllExceptCommercialAndPartner() {
    return this.personnel_service.findAllExceptCommercialAndPartner();
  }
  @Get('/by-code/:code')
  @ApiOperation({ summary: 'Récupère par CODE ' })
  @ApiParam({ name: 'code', description: 'CODE', type: String })
  @ApiResponse({ status: 200, description: 'Compte trouvé', type: Personnel })
  findOneByCode(@Param('code') code: string) {
    return this.personnel_service.findOneByCode(code);
  }
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.personnel_service.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('EDIT_PERSONNEL')
  update(@Param('id') id: number, @Body() dto: UpdatePersonnelDto) {
    return this.personnel_service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('DELETE_PERSONNEL')
  remove(@Param('id') id: number) {
    return this.personnel_service.remove(id);
  }

  @Get(':type_personnel/check/:code')
  @ApiOperation({ summary: 'Détaille un partenaire' })
  @ApiParam({ name: 'code', description: 'ID du partenaire', type: String })
  @ApiResponse({
    status: 200,
    description: 'Partenaire trouvé',
    type: Personnel,
  })
  @ApiResponse({ status: 404, description: 'Partenaire introuvable' })
  checkPromoCode(
    @Param('code') code: string,
    @Param('type_personnel') type_personnel: PersonnelTypeCode,
  ) {
    return this.personnel_service.checkCode(code, type_personnel);
  }

  @Get(':id/transactions')
  getTransactions(
    @Param('id') id: number,
    @Query() query: PaginationQueryTxDto,
  ) {
    const { page, limit, term, fields, exact, from, to, type, txType } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact;
    return this.personnel_service.getPersonnelTransactions(id, query);
  }

  @Post(':id/buyAll')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('BUY_PERSONNEL')
  unlockIfMaxReached(@Param('id') id: number) {
    return this.personnel_service.unlockIfMaxReached(id);
  }

  @Get(':id/deactivate')
  @ApiOperation({ summary: '' })
  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  deactivatePersonnel(@Param('id') id: number) {
    return this.personnel_service.deactivate(id);
  }

  @Get(':id/activate')
  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @ApiOperation({ summary: 'Get Inactive Personnel' })
  // @RequirePermissions('VIEW_BRANCH')
  activatePersonnel(@Param('id') id: number) {
    return this.personnel_service.activate(id);
  }
}
