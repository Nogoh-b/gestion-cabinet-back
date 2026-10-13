// permissions.service.ts
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { isProtectedPermission } from '../constants/iam.constants';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private repository: Repository<Permission>,
  ) {}

  async create(dto: CreatePermissionDto): Promise<Permission> {
    if (isProtectedPermission({ code: dto.code })) {
      throw new ForbiddenException(
        'Les permissions système ne peuvent pas être créées depuis un cabinet.',
      );
    }
    const exists = await this.repository.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Permission code already exists');
    return this.repository.save({ ...dto, status: 1 });
  }

  findAll(): Promise<Permission[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.repository.findOne({ where: { id } });
    if (!permission) throw new NotFoundException(`Permission ${id} not found`);
    return permission;
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
  async descativePermission(id: number): Promise<void> {
    await this.repository.update(id, { status: 0 });
  }
}
