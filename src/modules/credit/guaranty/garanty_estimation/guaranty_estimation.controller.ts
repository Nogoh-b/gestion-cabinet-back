import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  Post, Put,
} from '@nestjs/common';
import { GuarantyEstimationService } from './guaranty_estimation.service';

@Controller('guaranty-estimation')
export class GuarantyEstimationController {
  constructor(
    private readonly typeGuarantyEstimationService: GuarantyEstimationService,
  ) {}

  @Delete(':id')
  async deleteGuaranty(@Param('id') id: number) {
    const result =
      await this.typeGuarantyEstimationService.findOneGuarantyEstimation(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyEstimationService.deleteGuarantyEstimation(
      id,
    );
  }

  @Put('valid/:id')
  async validGuaranty(@Param('id') id: number) {
    const result =
      await this.typeGuarantyEstimationService.findOneGuarantyEstimation(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyEstimationService.validGuarantyEstimation(id);
  }

  @Put('reject/:id')
  async rejectGuaranty(@Param('id') id: number) {
    const result =
      await this.typeGuarantyEstimationService.findOneGuarantyEstimation(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return await this.typeGuarantyEstimationService.rejectGuarantyEstimation(id);
  }
}
