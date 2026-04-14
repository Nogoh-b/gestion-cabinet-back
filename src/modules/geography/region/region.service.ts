// regions.service.ts
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';





import { CountriesService } from '../country/country.service';
import { Division } from '../divivion/entities/divivion.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { Region } from './entities/region.entity';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';






@Injectable()
export class RegionsService  extends BaseServiceV1<Region> {
  constructor(
     protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Region)
    protected repository: Repository<Region>,
    private countriesService: CountriesService,
  ) {
    super(repository, paginationService);

  }

  async create(dto: CreateRegionDto): Promise<Region> {
    const country = await this.countriesService.findOne(dto.country_id);
    return this.repository.save({ ...dto, country });
  }

  findAll(): Promise<Region[]> {
    return this.repository.find({ relations: ['country'] });
  }

  async findOneDivision(id: number): Promise<Division[]> {
    const region = await this.repository.findOne({where :{ id}, relations: ['divisions'] });
    if (!region) throw new NotFoundException('Pays non existant');
    return region.divisions;
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