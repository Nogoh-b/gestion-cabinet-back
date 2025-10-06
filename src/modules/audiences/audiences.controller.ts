import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';

@Controller('audiences')
export class AudiencesController {
  constructor(private readonly audiencesService: AudiencesService) {}

  @Post()
  create(@Body() createAudienceDto: CreateAudienceDto) {
    return this.audiencesService.create(createAudienceDto);
  }

  @Get()
  findAll() {
    return this.audiencesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.audiencesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAudienceDto: UpdateAudienceDto) {
    return this.audiencesService.update(+id, updateAudienceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.audiencesService.remove(+id);
  }
}
