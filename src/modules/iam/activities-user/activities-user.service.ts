// activities-user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateActivitiesUserDto } from './dto/create-activities-user.dto';
import { ActivitiesUser } from './entities/activities-user.entity';
import { UsersService } from '../user/user.service';

@Injectable()
export class ActivitiesUserService {
  constructor(
    @InjectRepository(ActivitiesUser)
    private activitiesRepository: Repository<ActivitiesUser>,
    private usersService: UsersService,
  ) {}

  async createActivity(dto: CreateActivitiesUserDto): Promise<ActivitiesUser> {
    const user = await this.usersService.findOne(dto.userId);
    const activity = this.activitiesRepository.create({
      typeActivities: dto.typeActivities,
      user
    });
    
    return this.activitiesRepository.save(activity);
  }

  async getUserActivities(userId: number): Promise<ActivitiesUser[]> {
    return this.activitiesRepository.find({
      where: { user: { id: userId } },
      relations: ['user']
    });
  }
}