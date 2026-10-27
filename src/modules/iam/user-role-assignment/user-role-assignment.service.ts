import { User } from '../user/entities/user.entity';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
// user-role-assignment.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserRoleAssignmentDto } from './dto/create-user-role-assignment.dto';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { UsersService } from '../user/user.service';
import { UserRole } from '../user-role/entities/user-role.entity';

@Injectable()
export class UserRoleAssignmentService {
  constructor(
    @InjectRepository(UserRoleAssignment)
    private readonly userRoleAssignmentRepository: Repository<UserRoleAssignment>,
    private readonly usersService: UsersService,
    private readonly userRolesService: UserRolesService,
  ) {}

  async create(createDto: CreateUserRoleAssignmentDto): Promise<UserRoleAssignment> {
    await this.usersService.findOne(createDto.user_id);
    const role=await this.userRolesService.findOne(createDto.role_id);
    if(role.status!==1)throw new NotFoundException('Profil d’accès inactif.');
    const tenantId=getCurrentTenantId();
    return this.userRoleAssignmentRepository.manager.transaction(async em=>{
      await em.update(UserRoleAssignment,{user_id:createDto.user_id,tenant_id:tenantId},{status:0});
      const existing=await em.findOneBy(UserRoleAssignment,{user_id:createDto.user_id,role_id:role.id,tenant_id:tenantId});
      const assignment=await em.save(UserRoleAssignment,{...existing,user_id:createDto.user_id,role_id:role.id,tenant_id:tenantId,status:1});
      await em.update(User,{id:createDto.user_id,tenant_id:tenantId},{role:role.code});
      return assignment;
    });
  }

  async remove(user_id: number, role_id: number): Promise<void> {
    const user=await this.usersService.findOne(user_id);
    const role=await this.userRolesService.findOne(role_id);
    if(user.role===role.code)throw new ConflictException('Choisissez un autre profil avant de retirer le profil actif.');
    const result = await this.userRoleAssignmentRepository.delete({
      user_id,
      role_id,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-rôle non trouvée');
    }
  }

  async findByUser(user_id: number): Promise<any[]> {
    const roles_Ass = await this.userRoleAssignmentRepository.find({
      where: { user_id, status: 1 },
      relations: ['role'],
    });
    const roles: UserRole[] = [];
    for (const role_as of roles_Ass) {
      roles.push(role_as.role);
    }
    return roles;
  }

  async findCurrentRoleByUser(user_id: number): Promise<any[]> {
    const roles_Ass = await this.userRoleAssignmentRepository.find({
      where: { user_id, status: 1 },
      relations: ['role'],
    });
    const roles: UserRole[] = [];
    for (const role_as of roles_Ass) {
      roles.push(role_as.role);
    }
    return [];
  }

  async findByRole(role_id: number): Promise<UserRoleAssignment[]> {
    return this.userRoleAssignmentRepository.find({
      where: { role_id },
      relations: ['user'],
    });
  }
}
