// districts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDistrictDto } from './dto/create-district.dto';
import { District } from './entities/district.entity';
import { DivisionsService } from '../divivion/divivion.service';
import { UpdateDistrictDto } from './dto/update-district.dto';
import { LocationCity } from '../location_city/entities/location_city.entity';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

@Injectable()
export class DistrictsService    extends BaseServiceV1<District>{
  constructor(
         protected readonly paginationService: PaginationServiceV1,

    @InjectRepository(District)
    protected repository: Repository<District>,
    private divisionsService: DivisionsService
  ) {        super(repository, paginationService);
}
// src/modules/district/district.service.ts
protected getDefaultSearchOptions(): SearchOptions {
  return {
    // Champs pour la recherche globale
    searchFields: [
      'name',
      'code',
      'population',
      'division.name',
      'division.code',
      'division.region.name',
      'division.region.code',
      'division.region.country.name'
    ],
    
    // Champs pour recherche exacte
    exactMatchFields: [
      'id',
      'code',
      'division_id'
    ],
 
    
    // Champs de relations pour filtrage
    relationFields: [
      'division',
      'division.region',
      'division.region.country',
      'location_cities'
    ]
  };
}
  async create(dto: CreateDistrictDto): Promise<District> {
    const division = await this.divisionsService.findOne(dto.division_id);
    return this.repository.save({ ...dto, division });
  }

  findAll(): Promise<District[]> {
    return this.repository.find({ relations: ['division'] });
  }

  async findOneLocationCities(id: number): Promise<LocationCity[]> {
    const region = await this.repository.findOne({where :{ id}, relations: ['location_cities'] });
    if (!region) throw new NotFoundException('Pays non existant');
    return region.location_cities;
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