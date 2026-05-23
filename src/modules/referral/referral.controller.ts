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
  @RequirePermissions('create_referrer')
  create(@Body() dto: CreateReferrerDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referrers')
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referrers')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referrers')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_referrer')
  update(@Param('id') id: string, @Body() dto: UpdateReferrerDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_referrer')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}