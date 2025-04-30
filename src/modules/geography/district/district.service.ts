// districts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDistrictDto } from './dto/create-district.dto';
import { District } from './entities/district.entity';
import { DivisionsService } from '../divivion/divivion.service';
import { UpdateDistrictDto } from './dto/update-district.dto';

@Injectable()
export class DistrictsService {
  constructor(
    @InjectRepository(District)
    private repository: Repository<District>,
    private divisionsService: DivisionsService
  ) {}

  async create(dto: CreateDistrictDto): Promise<District> {
    const division = await this.divisionsService.findOne(dto.division_id);
    return this.repository.save({ ...dto, division });
  }

  findAll(): Promise<District[]> {
    return this.repository.find({ relations: ['division'] });
  }

  async findOne(id: number): Promise<District> {
    const district = await this.repository.findOne({ 
      where: { id },
      relations: ['division']
    });
    if (!district) throw new NotFoundException('District not found');
    return district;
  }

  async update(id: number, dto: UpdateDistrictDto): Promise<District> {
    const district = await this.findOne(id);
    
    if (dto.division_id) {
      district.division = await this.divisionsService.findOne(dto.division_id);
    }

    return this.repository.save({ ...district, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}