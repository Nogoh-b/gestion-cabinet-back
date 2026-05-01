import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';

@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post()
  create(@Body() createReferralDto: CreateReferralDto) {
    return this.referralService.create(createReferralDto);
  }

  @Get()
  findAll() {
    return this.referralService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.referralService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReferralDto: UpdateReferralDto) {
    return this.referralService.update(+id, updateReferralDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.referralService.remove(+id);
  }
}
