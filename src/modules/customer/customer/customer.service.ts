import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customerRepository.findOneBy({ id: createCustomerDto.id });
    if (existing) throw new ConflictException('ID already exists');

    if (createCustomerDto.email) {
      const emailExists = await this.customerRepository.findOneBy({ email: createCustomerDto.email });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    const customer = this.customerRepository.create({
      ...createCustomerDto,
      district: { id: createCustomerDto.districts_id },
      typeCustomer: { id: createCustomerDto.typeCustomer_id },
      locationCity: { id: createCustomerDto.locationCity_id },
    });

    return this.customerRepository.save(customer);
  }

  findAll(): Promise<Customer[]> {
    return this.customerRepository.find();
  }

  async findOne(id: number): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ id });
    if (!customer) throw new NotFoundException();
    return customer;
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);
    
    if (dto.email && dto.email !== customer.email) {
      const emailExists = await this.customerRepository.findOneBy({ email: dto.email });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    Object.assign(customer, dto);
    return this.customerRepository.save(customer);
  }

  async remove(id: number): Promise<void> {
    const result = await this.customerRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException();
  }
}