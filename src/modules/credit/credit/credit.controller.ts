import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreditDto } from './dto/credit.dto';
import { CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';

@Controller('credit')
export class CreditController {
  constructor() {}

  @Get('/:customerId/all')
  async findCredits() {
    // Implementation for finding a credit by ID
    return await this
  }

  @Get('/:customerId/:creditId')
  async findCreditById(id: string) {
    // Implementation for finding a credit by ID
  }

  @Put('/:customerId/:creditId')
  async updateCreditStatus(
    @Param('customerId') id: string,
    @Param('creditId') creditId: string,
    @Query('status') status: CREDIT_STATUS,
  ) {
    // Implementation for updating a credit
  }

  @Put('/:customerId/:creditId')
  async updateCreditState(
    @Param('customerId') id: string,
    @Param('creditId') creditId: string,
    @Query('status') state: CREDIT_STATE,
  ) {
    // Implementation for updating a credit
  }

  @Delete('/:customerId/:creditId')
  async deleteCredit(
    @Param('customerId') id: string,
    @Param('creditId') creditId: string,
  ) {
    // Implementation for deleting a credit
  }

  @Post('/:customerId')
  async createCredit(@Body() body: CreditDto) {
    // Implementation for creating a credit
  }
}
