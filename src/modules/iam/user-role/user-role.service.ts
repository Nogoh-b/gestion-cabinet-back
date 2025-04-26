import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './entities/user-role.entity';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
  ) {}

  async create(createUserRoleDto: CreateUserRoleDto): Promise<UserRole> {
    const role = this.userRoleRepository.create(createUserRoleDto);
    role.status = 1;
    return this.userRoleRepository.save(role);
  }

  async findAll(): Promise<UserRole[]> {
    return this.userRoleRepository.find();
  }  
  
  async update(id: number , updateUserRoleDto: UpdateUserRoleDto): Promise<UserRole> {
    await this.userRoleRepository.update(id, updateUserRoleDto);
    return (await this.userRoleRepository.findOne({ where: { id } }))!;
  }

  /*async remove(): Promise<UserRole[]> {
    // return this.userRoleRepository.find();
  }*/
}