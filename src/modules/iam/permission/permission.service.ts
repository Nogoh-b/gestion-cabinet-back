// permission/permission.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateResult } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { BaseRepository } from 'src/core/database/repositories/base.repository';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: BaseRepository<Permission>,
  ) {}

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    // const permission = this.permissionRepository.create(createPermissionDto);
    const permission = new Permission()
    permission.status = 1
    permission.code = 'Mon code'
    permission.description = 'Mon description'
    permission.created_at = new Date()
    permission.updated_at = new Date()
    return permission 
    return this.permissionRepository.save(permission);
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find();
  }

  async findOne(id: number): Promise<Permission[]> {
    return this.permissionRepository.find({ where: { id } });
  }

  async update(id: number, updatePermissionDto: UpdatePermissionDto): Promise<UpdateResult> {
    return this.permissionRepository.update(id, updatePermissionDto as any);
  }

  async updateStatus(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({ where: { id: Number(id) } });
    permission!.status = updatePermissionDto.status ?? permission!.status;
    return this.permissionRepository.save(permission!);
  }
}