import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  ConflictException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateJurisdictionDto } from './dto/create-jurisdiction.dto';
import { JurisdictionResponseDto } from './dto/jurisdiction-response.dto';
import { SearchJurisdictionDto } from './dto/search-jurisdiction.dto';
import { UpdateJurisdictionDto } from './dto/update-jurisdiction.dto';
import { Jurisdiction } from './entities/jurisdiction.entity';


@Injectable()
export class JurisdictionService extends BaseServiceV1<Jurisdiction> {
  constructor(
    @InjectRepository(Jurisdiction)
    private jurisdictionRepository: Repository<Jurisdiction>,
    protected readonly paginationService: PaginationServiceV1
  ) {
    super(jurisdictionRepository, paginationService);
  }

  protected getDefaultSearchOptions() {
    return {
      searchFields: [
        'name',
        'code',
        'description',
        'city',
        'region',
        'country'
      ],
      exactMatchFields: [
        'id',
        'is_active',
        'level',
        'jurisdiction_type'
      ],
      relationFields: [
        'parent_jurisdiction',
        'audiences'
      ],
    };
  }

  async create(dto: CreateJurisdictionDto): Promise<JurisdictionResponseDto> {
    // Vérifier l'unicité du code
    const existing = await this.jurisdictionRepository.findOne({
      where: { code: dto.code }
    });
    
    if (existing) {
      throw new ConflictException(`Une juridiction avec le code ${dto.code} existe déjà`);
    }

    const jurisdiction = this.jurisdictionRepository.create(dto);
    const saved = await this.jurisdictionRepository.save(jurisdiction);
    
    return plainToInstance(JurisdictionResponseDto, saved);
  }

  async findAll(): Promise<JurisdictionResponseDto[]> {
    const jurisdictions = await this.jurisdictionRepository.find({
      // where: { is_active: true },
      order: { name: 'ASC' }
    });
    
    return plainToInstance(JurisdictionResponseDto, jurisdictions);
  }

  async findOne(id: number): Promise<JurisdictionResponseDto> {
    const jurisdiction = await this.jurisdictionRepository.findOne({
      where: { id },
      relations: ['parent_jurisdiction', 'audiences']
    });

    if (!jurisdiction) {
      throw new NotFoundException(`Juridiction avec l'ID ${id} introuvable`);
    }

    return plainToInstance(JurisdictionResponseDto, jurisdiction);
  }

  async update(id: number, dto: UpdateJurisdictionDto): Promise<JurisdictionResponseDto> {
    const jurisdiction = await this.findOne(id);
    
    Object.assign(jurisdiction, dto);
    const updated = await this.jurisdictionRepository.save(jurisdiction);
    
    return plainToInstance(JurisdictionResponseDto, updated);
  }

  async searchJuridiction(searchParams: SearchJurisdictionDto, paginationParams?: any) {
    return this.searchWithTransformer(searchParams, JurisdictionResponseDto, paginationParams);
  }
}