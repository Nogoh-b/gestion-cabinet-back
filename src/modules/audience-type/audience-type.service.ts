import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateAudienceTypeDto } from './dto/create-audience-type.dto';
import { UpdateAudienceTypeDto } from './dto/update-audience-type.dto';
import { AudienceType } from './entities/audience-type.entity';
import { AudienceTypeResponseDto } from './dto/audience-type-response.dto';


@Injectable()
export class AudienceTypeService extends BaseServiceV1<AudienceType> {
  constructor(
    @InjectRepository(AudienceType)
    private audienceTypeRepository: Repository<AudienceType>,
    protected readonly paginationService: PaginationServiceV1
  ) {
    super(audienceTypeRepository, paginationService);
  }

  async create(dto: CreateAudienceTypeDto): Promise<AudienceTypeResponseDto> {
    const existing = await this.audienceTypeRepository.findOne({
      where: { code: dto.code }
    });
    
    if (existing) {
      throw new ConflictException(`Un type d'audience avec le code ${dto.code} existe déjà`);
    }

    const audienceType = this.audienceTypeRepository.create({
      ...dto,
      metadata: {
        required_documents: dto.required_documents,
        preparation_time_days: dto.preparation_time_days
      }
    });
    
    const saved = await this.audienceTypeRepository.save(audienceType);
    return plainToInstance(AudienceTypeResponseDto, saved);
  }

  async findAll(): Promise<AudienceTypeResponseDto[]> {
    const types = await this.audienceTypeRepository.find({
      where: { is_active: true },
      order: { category: 'ASC', name: 'ASC' }
    });
    
    return plainToInstance(AudienceTypeResponseDto, types);
  }

  async findOne(id: number): Promise<AudienceTypeResponseDto> {
    const type = await this.audienceTypeRepository.findOne({
      where: { id },
      relations: ['audiences']
    });

    if (!type) {
      throw new NotFoundException(`Type d'audience avec l'ID ${id} introuvable`);
    }

    return plainToInstance(AudienceTypeResponseDto, type);
  }

  async update(id: number, dto: UpdateAudienceTypeDto): Promise<AudienceTypeResponseDto> {
    const type = await this.findOne(id);
    
    Object.assign(type, dto);
    const updated = await this.audienceTypeRepository.save(type);
    
    return plainToInstance(AudienceTypeResponseDto, updated);
  }
}