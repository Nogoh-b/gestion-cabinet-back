// src/core-banking/providers/provider.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from 'src/modules/geography/country/entities/country.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { Provider } from './entities/provider.entity';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(Provider)
    private readonly repo: Repository<Provider>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {}

  async create(dto: CreateProviderDto) {
    const country = dto.country_id
      ? await this.countryRepo.findOne({ where: { code: dto.country_id } })
      : undefined;

    const provider = this.repo.create({
      code: dto.code,
      name: dto.name,
      status: dto.status,
      api_endpoint: dto.api_endpoint,
    });

    if (country) {
      provider.country = country;
    }

    return this.repo.save(provider);
  }

  findAll() {
    return this.repo.find({ relations: ['country'] });
  }

  async findOne(code: string) {
    const provider = await this.repo.findOne({
      where: { code },
      relations: ['country'],
    });
    if (!provider) throw new NotFoundException(`Provider ${code} not found`);
    return provider;
  }

  async findByCountry(countryCode: string) {
    return this.repo.find({
      where: { country: { code: countryCode } },
      relations: ['country'],
    });
  }

  async update(code: string, dto: UpdateProviderDto) {
    const provider = await this.findOne(code);

    if (dto.country_id) {
      const country = await this.countryRepo.findOne({ where: { code: dto.country_id } });
      provider.country = country || undefined;
    }

    Object.assign(provider, dto);
    return this.repo.save(provider);
  }

  async remove(code: string) {
    const provider = await this.findOne(code);
    return this.repo.remove(provider);
  }
}