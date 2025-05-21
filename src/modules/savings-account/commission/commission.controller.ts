import { Controller } from '@nestjs/common';
import { CommissionService } from './commission.service';

// @ApiTags('Fees / Commissions')
@Controller('fees/commissions')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  /*@Get()
  @ApiOperation({ summary: 'List all commissions' })
  @ApiResponse({ status: 200, description: 'List of commissions', type: [Commission] })
  findAll(): Promise<Commission[]> {
    return this.commissionService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a commission by ID' })
  @ApiParam({ name: 'id', description: 'Commission ID', type: Number })
  @ApiResponse({ status: 200, description: 'Commission found', type: Commission })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Commission> {
    return this.commissionService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new commission' })
  @ApiBody({ type: CreateCommissionDto })
  @ApiResponse({ status: 201, description: 'Commission created', type: Commission })
  create(@Body() dto: CreateCommissionDto): Promise<Commission> {
    return this.commissionService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace an existing commission' })
  @ApiParam({ name: 'id', description: 'Commission ID', type: Number })
  @ApiBody({ type: UpdateCommissionDto })
  @ApiResponse({ status: 200, description: 'Commission updated', type: Commission })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommissionDto,
  ): Promise<Commission> {
    return this.commissionService.update(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a commission' })
  @ApiParam({ name: 'id', description: 'Commission ID', type: Number })
  @ApiBody({ type: UpdateCommissionDto })
  @ApiResponse({ status: 200, description: 'Commission partially updated', type: Commission })
  partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommissionDto,
  ): Promise<Commission> {
    return this.commissionService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a commission' })
  @ApiParam({ name: 'id', description: 'Commission ID', type: Number })
  @ApiResponse({ status: 204, description: 'Commission deleted' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.commissionService.remove(id);
  }*/
}
