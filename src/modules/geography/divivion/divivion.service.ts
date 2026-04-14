// divisions.service.ts
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { District } from '../district/entities/district.entity';
import { RegionsService } from '../region/region.service';
import { CreateDivisionDto } from './dto/create-divivion.dto';
import { UpdateDivisionDto } from './dto/update-divivion.dto';
import { Division } from './entities/divivion.entity';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';



@Injectable()
export class DivisionsService   extends BaseServiceV1<Division> {
  constructor(
     protected readonly paginationService: PaginationServiceV1,

    @InjectRepository(Division)
    protected repository: Repository<Division>,
    private regionsService: RegionsService
  ) {
        super(repository, paginationService);

  }
// src/modules/divivion/division.service.ts
protected getDefaultSearchOptions(): SearchOptions {
  return {
    // Champs pour la recherche globale
    searchFields: [
      'name',
      'code',
      'population',
      'region.name',
      'region.code',
      'region.country.name'
    ],
    
    // Champs pour recherche exacte
    exactMatchFields: [
      'id',
      'code',
      'region_id',
      'status'
    ],
    

    
    // Champs de relations pour filtrage
    relationFields: [
      'region',
      'region.country',
      'districts'
    ]
  };
}
  async create(dto: CreateDivisionDto): Promise<Division> {
    const region = await this.regionsService.findOne(dto.region_id);
    return this.repository.save({ ...dto, region });

   /* const region = await this.regionsService.findOne(dto.region_id);
    return this.repository.save({
      ...dto,
      region,
      status: dto.status ?? 1
    });*/
  }

  findAll(): Promise<Division[]> {
    return this.repository.find({ relations: ['region'] });
  }

  async findOne(id: number): Promise<Division> {
    const division = await this.repository.findOne({ 
      where: { id },
      relations: ['region']
    });
    if (!division) throw new NotFoundException('Division not found');
    return division;
  }

  async findOneDistrict(id: number): Promise<District[]> {
    const division = await this.repository.findOne({ 
      where: { id },
      relations: ['districts']
    });
    if (!division) throw new NotFoundException('Division not found');
    return division.districts;
  }

  async update(id: number, dto: UpdateDivisionDto): Promise<Division> {
    const division = await this.findOne(id);
    
    if (dto.region_id) {
      division.region = await this.regionsService.findOne(dto.region_id);
    }

    return this.repository.save({ ...division, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}