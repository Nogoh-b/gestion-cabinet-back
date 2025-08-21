// user-role-assignment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
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
    // Vérifier l'existence de l'utilisateur et du rôle
    await this.usersService.findOne(createDto.user_id);
    await this.userRolesService.findOne(createDto.role_id);

    // Vérifier si l'association existe déjà
    await this.userRoleAssignmentRepository.update(
      {
        user_id: createDto.user_id,
        role_id: createDto.role_id,
      },
      { status: 0 }
    );

    // Créer la nouvelle association
    const assignment = this.userRoleAssignmentRepository.create({
      user_id: createDto.user_id,
      role_id: createDto.role_id,
      // assigned_by: createDto.assigned_by,
      status:  1
    });

    return this.userRoleAssignmentRepository.save(assignment);
  }

  async remove(user_id: number, role_id: number): Promise<void> {
    const result = await this.userRoleAssignmentRepository.delete({
      user_id,
      role_id
    });
    
    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-rôle non trouvée');
    }
  }

  async findByUser(user_id: number): Promise<any[]> {
    const roles_Ass = await this.userRoleAssignmentRepository.find({
      where: { user_id, status :1 },
      relations: ['role']
    });
    let roles : UserRole[] = []
    for (const role_as of roles_Ass) {
      roles.push(role_as.role)
    }
    return roles
  }

  async findCurrentRoleByUser(user_id: number): Promise<any[]> {
    const roles_Ass = await this.userRoleAssignmentRepository.find({
      where: { user_id, status :1 },
      relations: ['role']
    });
    let roles : UserRole[] = []
    for (const role_as of roles_Ass) {
      roles.push(role_as.role)
    }
    return []
  }

  async findByRole(role_id: number): Promise<UserRoleAssignment[]> {
    return this.userRoleAssignmentRepository.find({
      where: { role_id },
      relations: ['user']
    });
  }
}