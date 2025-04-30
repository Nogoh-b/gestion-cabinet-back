// permissions.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private repository: Repository<Permission>,
  ) {}

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const exists = await this.repository.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Permission code already exists');
    return this.repository.save(dto);
  }

  findAll(): Promise<Permission[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.repository.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}