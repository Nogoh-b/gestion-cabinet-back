// src/database/seeders/super-admin.seeder.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { RolePermission } from 'src/modules/iam/role-permission/entities/role-permission.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { UserRole } from 'src/modules/iam/user-role/entities/user-role.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';

@Injectable()
export class SuperAdminSeeder {
  private readonly logger = new Logger(SuperAdminSeeder.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,    
    private readonly employeeService: EmployeeService,
    @InjectRepository(UserRole)
    private readonly roleRepository: Repository<UserRole>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(UserRoleAssignment)
    private readonly userRoleAssignmentRepository: Repository<UserRoleAssignment>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
  ) {}

  async seed() {
    this.logger.log('Starting SUPER_ADMIN seeding...');

    // Check if SUPER_ADMIN permission already exists
    let superAdminPermission = await this.permissionRepository.findOne({
      where: { code: 'SUPER_ADMIN' },
    });

    if (!superAdminPermission) {
      // Create SUPER_ADMIN permission
      superAdminPermission = this.permissionRepository.create({
        code: 'SUPER_ADMIN',
        description: 'Full system access with all privileges',
        status: 1, // Assuming 1 means active
      });
      await this.permissionRepository.save(superAdminPermission);
      this.logger.log('Created SUPER_ADMIN permission');
    }

    // Check if SUPER_ADMIN role already exists
    let superAdminRole = await this.roleRepository.findOne({
      where: { code: 'SUPER_ADMIN' },
    });

    if (!superAdminRole) {
      // Create SUPER_ADMIN role
      superAdminRole = this.roleRepository.create({
        code: 'SUPER_ADMIN',
        name: 'Super Administrator',
        description: 'System super administrator with all privileges',
        status: 1,
      });
      await this.roleRepository.save(superAdminRole);
      this.logger.log('Created SUPER_ADMIN role');
    }

    // Assign permission to role if not already assigned
    const existingRolePermission = await this.rolePermissionRepository.findOne({
      where: {
        role_id: superAdminRole.id,
        permission_id: superAdminPermission.id,
      },
    });

    if (!existingRolePermission) {
      const rolePermission = this.rolePermissionRepository.create({
        role_id: superAdminRole.id,
        permission_id: superAdminPermission.id,
        status: 1,
      });
      await this.rolePermissionRepository.save(rolePermission);
      this.logger.log('Assigned SUPER_ADMIN permission to SUPER_ADMIN role');
    }

    // Check if SUPER_ADMIN user already exists
    const superAdminUsername = 'superadmin';
    let superAdminUser = await  this.employeeService.findOneByUsername(superAdminUsername, false) /*await this.userRepository.findOne({
      where: { username: superAdminUsername },
    });*/


    if (!superAdminUser) {
      // Create SUPER_ADMIN user
      const hashedPassword = await bcrypt.hash('Admin@1234', 10); // Use a strong default password
      let dto = new CreateUserDto();
      dto.email = 'admin@gmail.com'
      // dto.username = superAdminUsername
      dto.password = 'Admin@1234'
      //dto.branch_id = -1
      // dto.hire_date = new Date()
      superAdminUser = await this.employeeService.createEmployee(dto, false)
      this.logger.log('Created SUPER_ADMIN user');
    }

    // Assign role to user if not already assigned
    const existingUserRole = await this.userRoleAssignmentRepository.findOne({
      where: {
        user_id: superAdminUser.id,
        role_id: superAdminRole.id,
      },
    });

    if (!existingUserRole) {
      const userRoleAssignment = this.userRoleAssignmentRepository.create({
        user_id: superAdminUser.id,
        role_id: superAdminRole.id,
        assigned_by: superAdminUser.id, // Self-assigned
        status: 1,
      });
      await this.userRoleAssignmentRepository.save(userRoleAssignment);
      this.logger.log('Assigned SUPER_ADMIN role to SUPER_ADMIN user');
    }

    this.logger.log('SUPER_ADMIN seeding completed successfully');
  }
}