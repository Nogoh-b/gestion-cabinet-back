// location-cities.service.ts
import { BaseService } from 'src/core/shared/services/search/base.service';
import { DataSource, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';









import { DistrictsService } from '../district/district.service';
import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { LocationCity } from './entities/location_city.entity';












@Injectable()
export class LocationCitiesService extends BaseService<LocationCity> {
  constructor(
    @InjectRepository(LocationCity)
    private repository: Repository<LocationCity>,
    private districtsService: DistrictsService,
    dataSource: DataSource,
  ) {super()}
  getRepository(): Repository<LocationCity> {
    return this.repository;
  }
  async create(dto: CreateLocationCityDto): Promise<LocationCity> {
    const district = await this.districtsService.findOne(dto.districts_id);
    return this.repository.save({ ...dto, district });
  }

  findAll(): Promise<LocationCity[]> {
    
    return this.repository.find();
  }

  async findOne(id: number): Promise<LocationCity> {
    const city = await this.repository.findOne({
      where: { id },
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country',
      ],
    });
    if (!city) throw new NotFoundException('Location city not found');
    return city;
  }

  async findOneByCode(code: string): Promise<LocationCity> {
    const city = await this.repository.findOne({
      where: { code },
      relations: ['district'],
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

  async search(){

    const results = await this.enhancedSearch({
      alias: 'location_city',
      searchTerm: 'm',
      exactMatch: false,
      skip: 0,
      take: 20,
      orderBy: {
        field: 'create_at',
        direction: 'ASC',
      },
    });

    return results; 
  }
} 