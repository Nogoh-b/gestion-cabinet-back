// src/iam/user-role-assignment/user-role-assignment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class UserRoleAssignmentService {
  constructor(
    @InjectRepository(UserRoleAssignment)
    private assignmentRepository: Repository<UserRoleAssignment>,
  ) {}

  // Assigner un rôle
  async assignRole(assignRoleDto: AssignRoleDto): Promise<UserRoleAssignment> {
    const assignment = this.assignmentRepository.create(assignRoleDto);
    return this.assignmentRepository.save(assignment);
  }

  // Lister les rôles d'un utilisateur
  async getUserRoles(userId: number): Promise<UserRoleAssignment[]> {
    return this.assignmentRepository.find({
      where: { userId },
      relations: ['role'],
    });
  }

  // Mettre à jour le statut
  async updateStatus(
    userId: number,
    roleId: number,
    status: number,
  ): Promise<void> {
    await this.assignmentRepository.update(
      { userId, roleId },
      { status },
    );
  }

  // Supprimer une assignation
  async removeAssignment(userId: number, roleId: number): Promise<void> {
    const assignment = await this.assignmentRepository.findOne({
      where: { userId, roleId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignation introuvable');
    }
    await this.assignmentRepository.delete({ userId, roleId });
  }
}