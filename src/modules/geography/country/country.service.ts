// countries.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private repository: Repository<Country>,
  ) {}

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

  async update(id: number, dto: UpdateCountryDto): Promise<Country> {
    const country = await this.findOne(id);
    return this.repository.save({ ...country, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}