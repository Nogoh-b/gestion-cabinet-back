import { Injectable } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Branch } from '../branch/entities/branch.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class EmployeeService {
    constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    return this.employeeRepository.save(dto);
  }

  async findAllEmployees(): Promise<Employee[]> {
    return this.employeeRepository.find({ relations: ['user', 'branch'] });
  }

  findOne(id: number) {
    return `This action returns a #${id} employee`;
  }

  update(id: number, updateEmployeeDto: UpdateEmployeeDto) {
    return `This action updates a #${id} employee`;
  }

  remove(id: number) {
    return `This action removes a #${id} employee`;
  }
}
