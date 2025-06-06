import { UsersService } from 'src/modules/iam/user/user.service';
import { Repository } from 'typeorm';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';






import { Branch } from '../branch/entities/branch.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';







@Injectable()
export class EmployeeService {
    constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    private userService: UsersService,
  ) {}
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    const existingEmployee = await this.employeeRepository.findOne({
      where: {
        user: { id: dto.user_id, status: 1 }, // Assurez-vous que le statut de l'utilisateur est 1 (actif)
      },
      relations: ['user', 'branch'],
    });

    if (existingEmployee) {
      throw new ConflictException('Cet utilisateur est déjà employé dans une agence');
    }

    const user = await this.userService.findOne(dto.user_id);
    if (!user || user.status !== 1) {
      throw new NotFoundException('Utilisateur non trouvé ou inactif');
    }

    // 3. Vérifier que la branche existe et est active
    const branch = await this.branchRepository.findOne({
      where: { id: dto.branch_id, status: 1 },
    });
    if (!branch || branch.status !== 1) {
      throw new NotFoundException('Branche non trouvée ou inactive');
    }

    return this.employeeRepository.save(
      this.employeeRepository.create({
        hireDate: dto.hire_date || new Date(), // Date actuelle par défaut
        status: 1, // Statut actif par défaut
        user,
        branch,
        // ... autres champs du DTO
      })
    );
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
