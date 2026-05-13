import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ReferrerSearchDto } from './dto/referrer-search.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { ReferrersService } from './referral.service';
import { CreateReferrerDto } from './dto/create-referral.dto';
import { Referrer } from './entities/referral.entity';
import { UpdateReferrerDto } from './dto/update-referral.dto';

@Controller('referrers')
@ApiBearerAuth()
export class ReferrersController {
  constructor(private readonly service: ReferrersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_REFERRERS')
  create(@Body() dto: CreateReferrerDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher les apporteurs' })
  @ApiResponse({ status: 200, description: 'Liste des apporteurs', type: [Referrer] })
  async search(
    @Query() searchParams?: ReferrerSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      Referrer,
      paginationParams,
    );
  }

  @Get()
  @RequirePermissions('')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_REFERRERS')
  update(@Param('id') id: string, @Body() dto: UpdateReferrerDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_REFERRERS')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}