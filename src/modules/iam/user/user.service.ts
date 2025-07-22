import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { CreateEmployeeDto } from 'src/modules/agencies/employee/dto/create-employee.dto';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Repository } from 'typeorm';
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';





import { UserRole } from '../user-role/entities/user-role.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';






@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,    
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private roleService : UserRolesService,

    // @Inject(forwardRef(() => UserRolesService))
    // private employeeService : EmployeeService
    
  ) {
        // console.log(forwardRef)
  }

  async create(createUserDto: CreateUserDto , is_strict = true): Promise<UserResponseDto> {
    //await validateDto(CreateUserDto, createUserDto)
    const customer = await this.customerRepository.findOneBy({id:createUserDto.customer_id})
    if (!customer &&  is_strict) {
      throw new NotFoundException('Le compte client est inexistant');
    }
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });
    const existingUserName = await this.userRepository.findOne({
      where: { username: createUserDto.username },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    if (existingUserName) {
      throw new ConflictException('Username already exists');
    }
 
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      customer : customer ?? new Customer(),
      password: hashedPassword, 
      status : 1
    });

    const savedUser = await this.userRepository.save(user);
    let dtoE = new CreateEmployeeDto
    const {hire_date, branch_id} = createUserDto
    // await this.employeeService.createEmployee({hire_date, branch_id, user_id : savedUser.id})

    return plainToInstance(UserResponseDto, savedUser);
  }

  async findAll() {
    const users = await this.userRepository
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.customer', 'customer')
    .leftJoinAndSelect('user.employee', 'employee')
    .leftJoinAndSelect('employee.branch', 'branch')
    .leftJoinAndSelect('user.roleAssignments', 'roleAssignment', 'roleAssignment.status = 1')
    .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
    .where('user.status = 1')
    .getMany();
    return users.map((user) => plainToInstance(UserResponseDto, user));
  }


  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['customer', 'roleAssignments.role'],
    });

    if (!user) throw new NotFoundException('User not found');

    const activeRoleAssignment = user.roleAssignments.find(
      (assignment) => assignment.role.status === 1,
    );

    user.roleAssignments = activeRoleAssignment ? [activeRoleAssignment] : [];

    return plainToInstance(UserResponseDto, user);
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
  }
}