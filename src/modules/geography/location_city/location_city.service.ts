// location-cities.service.ts
import { plainToInstance } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DistrictsService } from '../district/district.service';
import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { ResponseLocationCityDto } from './dto/response-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { LocationCity } from './entities/location_city.entity';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

@Injectable()
export class LocationCitiesService extends BaseServiceV1<LocationCity> {
  constructor(
    @InjectRepository(LocationCity)
    protected repository: Repository<LocationCity>,
    private districtsService: DistrictsService,
    protected readonly paginationService: PaginationServiceV1,
    dataSource: DataSource,
  ) {
    super(repository, paginationService);
  }

  getRepository(): Repository<LocationCity> {
    return this.repository;
  }

  async create(dto: CreateLocationCityDto): Promise<LocationCity> {
    const district = await this.districtsService.findOne(dto.districts_id);
    return this.repository.save({ ...dto, district });
  }

  // ✅ CORRECTION : Les relationFields doivent être des chemins complets
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs pour la recherche globale
      searchFields: [
        'name',
        'code',
        'population',
        'district.name',
        'district.code',
        'district.division.name',
        'district.division.code',
        'district.division.region.name',
        'district.division.region.code',
        'district.division.region.country.name',
      ],
      
      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'code',
        'districts_id'
      ],
 
      
      // ✅ CORRECTION : Spécifier les chemins de relations complets
      relationFields: [
        'district',                                    // Niveau 1
        'district.division',                          // Niveau 2
        'district.division.region',                   // Niveau 3
        'district.division.region.country'            // Niveau 4
      ]
    };
  }

  async findAll(): Promise<ResponseLocationCityDto[]> {
    const location_cities = await this.repository.find({
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country'
      ]
    });
    
    return location_cities.map(location_city => 
      plainToInstance(ResponseLocationCityDto, location_city)
    );
  }

  async findOne(id: number): Promise<ResponseLocationCityDto> {
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
    return plainToInstance(ResponseLocationCityDto, city, {
      excludeExtraneousValues: true
    });
  }

  async findOneSimple(id: number): Promise<LocationCity> {
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
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country'
      ],
    });
    if (!city) throw new NotFoundException(`Location city with code ${code} not found`);
    return city;
  }

  async update(id: number, dto: UpdateLocationCityDto): Promise<LocationCity> {
    const city = await this.findOneSimple(id);
    if (dto.districts_id) {
      city.district = await this.districtsService.findOne(dto.districts_id);
    }
    // Mettre à jour les autres propriétés
    Object.assign(city, dto);
    return this.repository.save(city);
  }

  async remove(id: number): Promise<void> {
    const city = await this.findOneSimple(id);
    await this.repository.remove(city);
  }

  // Méthode utilitaire pour rechercher par région
  async findByRegion(regionId: number): Promise<LocationCity[]> {
    return this.repository.find({
      where: {
        district: {
          division: {
            region: {
              id: regionId
            }
          }
        }
      },
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country'
      ]
    });
  }

  // Méthode utilitaire pour rechercher par division
  async findByDivision(divisionId: number): Promise<LocationCity[]> {
    return this.repository.find({
      where: {
        district: {
          division: {
            id: divisionId
          }
        }
      },
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country'
      ]
    });
  }

  // Méthode utilitaire pour rechercher par district
  async findByDistrict(districtId: number): Promise<LocationCity[]> {
    return this.repository.find({
      where: { district: { id: districtId } },
      relations: [
        'district',
        'district.division',
        'district.division.region',
        'district.division.region.country'
      ]
    });
  }
}