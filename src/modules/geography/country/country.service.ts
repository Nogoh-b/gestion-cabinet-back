import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { Country } from './entities/country.entity';
import { Region } from '../region/entities/region.entity';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';




@Injectable()
export class CountriesService extends BaseServiceV1<Country> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    
    @InjectRepository(Country)
    protected repository: Repository<Country>,
  ) {
    super(repository, paginationService);

  }

  // src/modules/country/country.service.ts
protected getDefaultSearchOptions(): SearchOptions {
  return {
    // Champs pour la recherche globale
    searchFields: [
      'name',
      'code',
      'population'
    ],
    
    // Champs pour recherche exacte
    exactMatchFields: [
      'id',
      'code'
    ],
    
    
    // Champs de relations pour filtrage
    relationFields: [
      'regions'
    ]
  };
}

  create(dto: CreateCountryDto): Promise<Country> {
    return this.repository.save(dto);
  }

  findAll(): Promise<Country[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<Country> {
    const country = await this.repository.findOneBy({ id });
    if (!country) throw new NotFoundException();
    return country;
  }

  async findOneRegions(id: number): Promise<Region[]> {
    const country = await this.repository.findOne({where :{ id}, relations: ['regions'] });
    if (!country) throw new NotFoundException('Pays non existant');
    return country.regions;
  }

  async update(id: number, dto: UpdateCountryDto): Promise<Country> {
    const country = await this.findOne(id);
    return this.repository.save({ ...country, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}