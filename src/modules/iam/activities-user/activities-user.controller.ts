// activities-user.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ActivitiesUserService } from './activities-user.service';
import { CreateActivitiesUserDto } from './dto/create-activities-user.dto';

@ApiTags('User Activities')
@Controller('activities-user')
export class ActivitiesUserController {
  constructor(private readonly activitiesService: ActivitiesUserService) {}

  @Post()
  @ApiOperation({ summary: 'Log user activity' })
  create(@Body() dto: CreateActivitiesUserDto) {
    // return this.activitiesService.createActivity(dto);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user activities' })
  getUserActivities(@Param('userId') userId: string) {
    return this.activitiesService.getUserActivities(+userId);
  }
}