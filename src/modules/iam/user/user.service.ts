import * as bcrypt from 'bcrypt';
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole } from '../user-role/entities/user-role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    return plainToInstance(UserResponseDto, savedUser);
  }

  async findAll(): Promise<UserResponseDto[]> {
      const users = await this.userRepository.find({
      relations: [
        'customer',
        'roleAssignments',
        'roleAssignments.role'
      ]
    });
    return users.map(user => plainToInstance(UserResponseDto, user));
  }

  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'customer',
        'roleAssignments.role'
      ]
    });
    
    if (!user) throw new NotFoundException('User not found');
    
    return plainToInstance(UserResponseDto, user);
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ 
      where: { username },
    select: ['id', 'username', 'password', 'status'] // Ajouter 'password'
    });
    return  user;

  }


  async updateRefreshToken(userId: number, refreshToken: string | undefined): Promise<void> {
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
}