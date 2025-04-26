import { Controller, Post, Body, Get } from '@nestjs/common';
import { UserRoleService } from './user-role.service';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserRole } from './entities/user-role.entity';

@ApiTags('IAM - Roles')
@Controller('iam/roles')
export class UserRoleController {
  constructor(private readonly userRoleService: UserRoleService) {}

  @Post()
  @ApiOperation({ summary: 'creation d\'un role ' })
  async create(@Body() createUserRoleDto: CreateUserRoleDto) {
    return this.userRoleService.create(createUserRoleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Mettre à jour le statut d\'une assignation' })
  async findAll() {
    return this.userRoleService.findAll();
  }

  @ApiOperation({ summary: 'Mettre à jour le statut d\'une assignation' })
  async update(id: number, updateUserRoleDto: UpdateUserRoleDto): Promise<UserRole> {
    return this.userRoleService.update(id, updateUserRoleDto);
  }

  async remove(id: number): Promise<void> {
    // await this.userRoleRepository.delete(id);
  }
}