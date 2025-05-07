import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Repository } from 'typeorm';
import { GenCOde } from 'src/core/shared/utils/generation.util';
import { validateDto } from 'src/core/shared/pipes/validate-dto';

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
    let code: string;
    let attempts = 0;
    do {
      code = GenCOde.randomDigits(2);
      attempts++;
    } while (!(await this.isBranchCodeUnique(code)) && attempts < 10);

    if (attempts >= 5) {
      throw new Error('Échec de génération d’un code de la branche');
    }
    dto.code = code
    await validateDto(CreateBranchDto, dto)
    return await this.branchRepository.save(dto);
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
  async isBranchCodeUnique(code: string): Promise<boolean> {
    const existing = await this.branchRepository.findOne({ where: { code } });
    return !existing;
  }

  
  async findOne(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ 
      where: { id },
     
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    return branch;
  }
}
