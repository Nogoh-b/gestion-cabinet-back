import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';
import { UsersService } from 'src/modules/iam/user/user.service';
import { Repository } from 'typeorm';






import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';


import { Branch } from '../branch/entities/branch.entity';
import { EmployeeResponseDto } from './dto/response-employee.dto';
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
  async createEmployee(dto: CreateUserDto): Promise<EmployeeResponseDto> {

    const branch = await this.branchRepository.findOne({
      where: { id: dto.branch_id, status: 1 },
    });
    if (!branch || branch.status !== 1) {
      throw new NotFoundException('Branche non trouvée ou inactive');
    }
    const user = await this.userService.create(dto)

    /*const user = await this.userService.findOne(id);
    if (!user || user.status !== 1) {
      throw new NotFoundException('Utilisateur non trouvé ou inactif');
    }*/



    const employee = await this.employeeRepository.save(
      this.employeeRepository.create({
        hireDate: dto.hire_date || new Date(), // Date actuelle par défaut
        status: 1, // Statut actif par défaut
        user,
        branch,
        // ... autres champs du DTO
      }),
    );
    return plainToInstance(EmployeeResponseDto, employee);
  }

  async findAllEmployees(branch_id: number  = 0): Promise<EmployeeResponseDto[]> {
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect('user.roleAssignments', 'roleAssignment', 'roleAssignment.status = 1')
      .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
      .innerJoinAndSelect('employee.branch', 'branch', branch_id != 0 ? 'branch.id = :branch_id' : '', { branch_id })
      .where('user.status = 1')
      .getMany();
    return plainToInstance(EmployeeResponseDto, employees);
  }


  async findOneByUsername(username: string): Promise<EmployeeResponseDto> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect('user.roleAssignments', 'roleAssignment', 'roleAssignment.status = 1')
      .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('user.username = :username', { username })
      .andWhere('user.status = 1')
      .getOne();

    if (!employee) {
      throw new NotFoundException(`Employee with username ${username} not found`);
    }

    return plainToInstance(EmployeeResponseDto, employee);
  }




/*
  
  async findOne(id: number): Promise<UserResponseDto> {
    return await this.userService.findOne
  }
  
  async findByUsername(username: string): Promise<any | null> {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['customer', 'roleAssignments.role'],
    });

    if (!user) throw new NotFoundException('User not found');

    const activeRoleAssignment = user.roleAssignments.find(
      (assignment) => assignment.role.status === 1,
    );

    user.roleAssignments = activeRoleAssignment ? [activeRoleAssignment] : [];
    return user;
  }
  
  async getUserPermissions(
    userId: number
  ): Promise<any> {
    const role = (await this.findOne(userId))?.role;
    return this.roleService.getPermissionsByCode(role)

  }
  
  
  async updateRefreshToken(
    userId: number,
    refreshToken: string | undefined,
  ): Promise<void> {
    // Assuming you are using TypeORM or similar ORM
    await this.userRepository.update(userId, {
      refreshToken: refreshToken,
    });
  }

  // You might also need a method to get a user by ID
  async findById(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  // And potentially a method to find a user by refresh token
  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { refreshToken } });
  }

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleAssignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'role')
      .where('user.id = :userId', { userId })
      .select(['role.code', 'role.name'])
      .getRawMany();
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async descativeUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 0 });
    return
  }
  async activateUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 1 });
    return
  }*/
}
