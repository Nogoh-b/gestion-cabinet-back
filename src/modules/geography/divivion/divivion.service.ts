// divisions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateDivisionDto } from './dto/update-divivion.dto';
import { Division } from './entities/divivion.entity';
import { RegionsService } from '../region/region.service';
import { CreateDivisionDto } from './dto/create-divivion.dto';

@Injectable()
export class DivisionsService {
  constructor(
    @InjectRepository(Division)
    private repository: Repository<Division>,
    private regionsService: RegionsService
  ) {}

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