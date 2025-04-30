// location-cities.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationCity } from './entities/location_city.entity';
import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { DistrictsService } from '../district/district.service';

@Injectable()
export class LocationCitiesService {
  constructor(
    @InjectRepository(LocationCity)
    private repository: Repository<LocationCity>,
    private districtsService: DistrictsService
  ) {}

  async create(dto: CreateLocationCityDto): Promise<LocationCity> {
    const district = await this.districtsService.findOne(dto.districts_id);
    return this.repository.save({ ...dto, district });
  }

  findAll(): Promise<LocationCity[]> {
    return this.repository.find({ relations: ['district'] });
  }

  async findOne(id: number): Promise<LocationCity> {
    const city = await this.repository.findOne({ 
      where: { id },
      relations: ['district']
    });
    if (!city) throw new NotFoundException();
    return city;
  }

  async update(id: number, dto: UpdateLocationCityDto): Promise<LocationCity> {
    const city = await this.findOne(id);
    if (dto.districts_id) {
      city.district = await this.districtsService.findOne(dto.districts_id);
    }
    return this.repository.save({ ...city, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
} 