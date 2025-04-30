// regions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { CountriesService } from '../country/country.service';
import { UpdateRegionDto } from './dto/update-region.dto';

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Region)
    private repository: Repository<Region>,
    private countriesService: CountriesService,
  ) {}

  async create(dto: CreateRegionDto): Promise<Region> {
    const country = await this.countriesService.findOne(dto.country_id);
    return this.repository.save({ ...dto, country });
  }

  findAll(): Promise<Region[]> {
    return this.repository.find({ relations: ['country'] });
  }

  async findOne(id: number): Promise<Region> {
    const region = await this.repository.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!region) throw new NotFoundException();
    return region;
  }

  async update(id: number, dto: UpdateRegionDto): Promise<Region> {
    const region = await this.findOne(id);
    if (dto.country_id) {
      region.country = await this.countriesService.findOne(dto.country_id);
    }
    return this.repository.save({ ...region, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}