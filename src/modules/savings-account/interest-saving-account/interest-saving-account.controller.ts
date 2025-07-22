import { Controller, Get, Post, Put, Patch, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { InterestSavingAccountService } from './interest-saving-account.service';
import { InterestSavingAccount } from './entities/interest-saving-account.entity';
import { CreateInterestSavingAccountDto } from './dto/create-interest-saving-account.dto';
import { UpdateInterestSavingAccountDto } from './dto/update-interest-saving-account.dto';

@ApiTags('Interest Plans')
@Controller('interest-plans')
export class InterestSavingAccountController {
  constructor(private readonly service: InterestSavingAccountService) {}

  @Get()
  @ApiOperation({ summary: 'List all interest plans' })
  @ApiResponse({ status: 200, type: [InterestSavingAccount] })
  find_all(): Promise<InterestSavingAccount[]> {
    return this.service.find_all();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an interest plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: Number })
  @ApiResponse({ status: 200, type: InterestSavingAccount })
  find_one(@Param('id', ParseIntPipe) id: number): Promise<InterestSavingAccount> {
    return this.service.find_one(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new interest plan' })
  @ApiBody({ type: CreateInterestSavingAccountDto })
  @ApiResponse({ status: 201, type: InterestSavingAccount })
  create(@Body() dto: CreateInterestSavingAccountDto): Promise<InterestSavingAccount> {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace an existing interest plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: Number })
  @ApiBody({ type: UpdateInterestSavingAccountDto })
  @ApiResponse({ status: 200, type: InterestSavingAccount })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInterestSavingAccountDto,
  ): Promise<InterestSavingAccount> {
    return this.service.update(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update an interest plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: Number })
  @ApiBody({ type: UpdateInterestSavingAccountDto })
  @ApiResponse({ status: 200, type: InterestSavingAccount })
  partial_update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInterestSavingAccountDto,
  ): Promise<InterestSavingAccount> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an interest plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', type: Number })
  @ApiResponse({ status: 204, description: 'Plan deleted' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}
