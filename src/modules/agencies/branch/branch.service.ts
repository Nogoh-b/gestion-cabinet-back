import { Injectable } from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Repository } from 'typeorm';

@Injectable()
export class BranchService {
    constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}
  // Branches
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    return this.branchRepository.save(dto);
  }

  async findAllBranches(): Promise<Branch[]> {
    return this.branchRepository.find({ relations: ['location_city'] });
  }
  async updateBranch(id: number, dto: UpdateBranchDto): Promise<Branch | any> {
    await this.branchRepository.update(id, dto);
    return this.branchRepository.findOneBy({ id });
  }

  async deleteBranch(id: number): Promise<void> {
    await this.branchRepository.delete(id);
  }
  findOne(id: number) {
    return `This action returns a #${id} branch`;
  }

  update(id: number, updateBranchDto: UpdateBranchDto) {
    return `This action updates a #${id} branch`;
  }

  remove(id: number) {
    return `This action removes a #${id} branch`;
  }
}
