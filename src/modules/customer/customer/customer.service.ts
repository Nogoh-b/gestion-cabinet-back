import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';
import { TypeCustomersService } from '../type-customer/type-customer.service';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';
import { plainToInstance } from 'class-transformer';
import { CustomerResponseDto } from './dto/customer-response.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private typeCustomerService: TypeCustomersService,
    private locationcityService: LocationCitiesService ,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const existing = await this.customerRepository.findOneBy({ number_phone_1 : createCustomerDto.number_phone_1 });
    const type_customer = await this.typeCustomerService.findOne( createCustomerDto.type_customer_id);
    const location_city = await this.locationcityService.findOne(createCustomerDto.location_city_id);
    if (existing) throw new ConflictException('Le client existe deja');
    if (!type_customer || !location_city) throw new NotFoundException('Le type de client ou la location invalide');

    if (createCustomerDto.email) {
      const emailExists = await this.customerRepository.findOneBy({ email: createCustomerDto.email });
      if (emailExists) throw new ConflictException('L\'adresse mail existe deja');
    }

    const customer = this.customerRepository.create({
      ...createCustomerDto,
      type_customer,
      location_city,
    });
    customer.private_key = 'kjkjlkjlkjlkjkl'
    customer.public_key = '522054sds_d_sd_sdsd'
    customer.status = 0

    return plainToInstance(
      CustomerResponseDto,
      await this.customerRepository.save(customer),
    );

  }

  async findAll(): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.find({relations : ['type_customer','location_city']})
    return plainToInstance(CustomerResponseDto, customers );
  }

  async findOne(id: number): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { id } , relations : ['type_customer','location_city'] });
    if (!customer) throw new NotFoundException();
    return plainToInstance(CustomerResponseDto, customer);
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.findOne(id);
    
    if (dto.email && dto.email !== customer.email) {
      const emailExists = await this.customerRepository.findOneBy({ email: dto.email });
      if (emailExists) throw new ConflictException('Email already exists');
    }

    Object.assign(customer, dto);
    return plainToInstance(CustomerResponseDto , this.customerRepository.save(customer));
  }

  async remove(id: number): Promise<void> {
    const result = await this.customerRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException();
  }
}