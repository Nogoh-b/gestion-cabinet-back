import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { UserRole } from 'src/core/enums/user-role.enum';
import { EmailService } from 'src/core/shared/services/email/email.service';

import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';

import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';

import { User } from 'src/modules/iam/user/entities/user.entity';

import { UsersService } from 'src/modules/iam/user/user.service';

import { Repository } from 'typeorm';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { Branch } from '../branch/entities/branch.entity';
import { EmployeeResponseDto } from './dto/response-employee.dto';
import { Employee, EmployeePosition, EmployeeStatus } from './entities/employee.entity';



@Injectable()
export class EmployeeService  extends BaseServiceV1<Employee> {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private mailerService: EmailService,
    private userService: UsersService,
        protected readonly paginationService: PaginationServiceV1,
  ) {

    super(employeeRepository, paginationService);
  }
/**
   * Override des options de recherche par défaut pour Customer
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs pour la recherche globale
      searchFields: [
        'dossier_number',
        'object',
        'jurisdiction',
        'jurisdiction.name',
        'court_name',
        'case_number',
        'opposing_party_name',
        'opposing_party_lawyer',
        'opposing_party_contact',
        'client.first_name',
        'client.last_name',
        'procedure_type.name',
        'procedure_subtype.name',
        'client.email',
        'danger_level'
      ],
      
      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'status',
        'confidentiality_level',
        'priority_level',
        'budget_estimate',
        'danger_level'
      ],
      
      // Champs pour ranges de dates
      /*dateRangeFields: [
        'created_at',
        'updated_at',
        'opening_date',
        'closing_date'
      ],*/
      
      // Champs de relations pour filtrage
      relationFields: ['user', 'branch', 'managed_dossiers', 'collaborating_dossiers']
    };
  }

async createEmployee(
  dto: CreateUserDto,
  is_strict = true,
): Promise<EmployeeResponseDto> {
  // Vérification de la branche
  const branch = await this.branchRepository.findOne({
    where: { id: dto.branch_id, status: 1 },
  });
  
  if ((!branch || branch.status !== 1) && dto.branch_id) {
    throw new NotFoundException('Branche non trouvée ou inactive');
  }

  // Vérification des doublons d'email
  const existingUser = await this.userRepo.findOne({
    where: { email: dto.email }
  });

  if (existingUser && is_strict) {
    throw new ConflictException('Un utilisateur avec cet email existe déjà');
  }

  // Création de l'utilisateur
  const user = this.userRepo.create({
    first_name: dto.first_name,
    last_name: dto.last_name,
    email: dto.email,
    password: await bcrypt.hash(dto.password, 12),
    // phoneNumber: dto.phone_number,
    role: this.getUserRoleFromPosition(dto.position),
    // isActive: true,
  });

  const savedUser = await this.userRepo.save(user);

  // Création de l'employé avec tous les champs
  const employeeData: Partial<Employee> = {
    user: savedUser[0],
    branch: branch || undefined,
    position: dto.position,
    hireDate: dto.hire_date ? new Date(dto.hire_date) : new Date(),
    status: EmployeeStatus.ACTIVE,
    specialization: dto.specialization,
    bar_association_number: dto.bar_association_number,
    bar_association_city: dto.bar_association_city,
    years_of_experience: dto.years_of_experience,
    hourly_rate: dto.hourly_rate,
    is_available: dto.is_available ?? true,
    max_dossiers: dto.max_dossiers ?? 50,
    bio: dto.bio,
    languages: dto.languages,
    expertise_areas: dto.expertise_areas,
    birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
    professional_address: dto.professional_address,
    professional_phone: dto.professional_phone,
    siret_number: dto.siret_number,
    tva_number: dto.tva_number,
  };

  const employee = await this.employeeRepository.save(
    this.employeeRepository.create(employeeData)
  );

  return plainToInstance(EmployeeResponseDto, employee);
}

// Méthode helper pour déterminer le rôle utilisateur
private getUserRoleFromPosition(position: EmployeePosition): UserRole {
  switch (position) {
    case EmployeePosition.AVOCAT:
      return UserRole.AVOCAT;
    case EmployeePosition.SECRETAIRE:
    case EmployeePosition.ASSISTANT:
    case EmployeePosition.ADMINISTRATIF:
      return UserRole.SECRETAIRE;
    case EmployeePosition.HUISSIER:
      return UserRole.HUISSIER;
    case EmployeePosition.STAGIAIRE:
      return UserRole.STAGIAIRE;
    default:
      return UserRole.SECRETAIRE;
  }
}

  async findAllEmployees(
    branch_id: number = 0,
  ): Promise<EmployeeResponseDto[]> {
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect(
        'user.roleAssignments',
        'roleAssignment',
        'roleAssignment.status = 1',
      )
      .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
      .innerJoinAndSelect(
        'employee.branch',
        'branch',
        branch_id != 0 ? 'branch.id = :branch_id' : '',
        { branch_id },
      )
      .where('user.status = 1')
      .getMany();
    return plainToInstance(EmployeeResponseDto, employees);
  }

  async findOneByUsername(
    username: string,
    is_strict = true,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect(
        'user.roleAssignments',
        'roleAssignment',
        'roleAssignment.status = 1',
      )
      .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('user.username = :username', { username })
      .andWhere('user.status = 1')
      .getOne();

    if (!employee && is_strict) {
      throw new NotFoundException(
        `Employee with username ${username} not found`,
      );
    }

    return plainToInstance(EmployeeResponseDto, employee);
  }
  async findByEmail(
    email: string,
    is_strict = true,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.customer', 'customer')
      .leftJoinAndSelect(
        'user.roleAssignments',
        'roleAssignment',
        'roleAssignment.status = 1',
      )
      .leftJoinAndSelect('roleAssignment.role', 'role', 'role.status = 1')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('user.email = :email', { email })
      .andWhere('user.status = 1')
      .getOne();

    if (!employee && is_strict) {
      throw new NotFoundException(
        `Employee with email ${email} not found`,
      );
    }

    return plainToInstance(EmployeeResponseDto, employee);
  }

  // Génère un mot de passe temporaire (alphanum + caractères spéciaux)
  private generate_temp_password(length = 12): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*?';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur et envoie le nouveau par email.
   * - On accepte soit un id, soit un email pour identifier l'utilisateur.
   * - Le mot de passe est hashé en base et le clair est envoyé par email.
   * - À utiliser comme mot de passe temporaire (l'utilisateur devra le changer après connexion).
   */
  async send_new_password(params: {
    id: number;
    email?: string;
  }): Promise<any> {
    // 1) Vérifications de base
    if (!params?.id && !params?.email) {
      throw new NotFoundException(
        'Veuillez fournir un identifiant (id) ou un email utilisateur.',
      );
    }

    // 2) Récupération utilisateur
    // Si vous voulez être explicite :
    const user = await this.userService.findOne(params.id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.email) {
      throw new NotFoundException("L'utilisateur n'a pas d'email renseigné");
    }

    // 3) Génération + hash
    const plain_password = this.generate_temp_password(12);
    const hashed_password = await bcrypt.hash(plain_password, 10);

    // 4) Sauvegarde en base
    await this.userService.update(user.id, { password: hashed_password });

    const html = `<p>Bonjour,</p>
    <p>Votre mot de passe a été réinitialisé.</p>
    <p><strong>Nouveau mot de passe temporaire :</strong> ${plain_password}</p>
    <p>Par mesure de sécurité, merci de le changer dès votre prochaine connexion.</p>
    <p>— Support</p>`;
    await this.mailerService.sendPasswordResetEmail(user.email, html);
    /*await this.mailerService.sendMail({
      to: user.email,
      subject: 'Votre nouveau mot de passe',
      text:
    `Bonjour,

    Votre mot de passe a été réinitialisé.
    Nouveau mot de passe temporaire : ${plain_password}

    Par mesure de sécurité, merci de le changer dès votre prochaine connexion.

    — Support`,
        html:
    `<p>Bonjour,</p>
    <p>Votre mot de passe a été réinitialisé.</p>
    <p><strong>Nouveau mot de passe temporaire :</strong> ${plain_password}</p>
    <p>Par mesure de sécurité, merci de le changer dès votre prochaine connexion.</p>
    <p>— Support</p>`,
      });*/

    // 6) Retour clair en français
    return { message: 'Mot de passe réinitialisé et envoyé par email.' };
  }

  async findOne(id: number) {
    return await this.employeeRepository.findOne({
      relations: { user: true, branch: true },
      where: {
        user: { id },
      },
    });
  }

  /* async findByUsername(username: string): Promise<any | null> {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['customer', 'roleAssignments.role'],
    });

    if (!user) throw new NotFoundException('User not found');

    const activeRoleAssignment = user.roleAssignments.find(
      (assignment) => assignment.role.status === 1,
    );

    user.roleAssignments = activeRoleAssignment ? [activeRoleAssignment] : [];
    return user;
  }
  
  async getUserPermissions(
    userId: number
  ): Promise<any> {
    const role = (await this.findOne(userId))?.role;
    return this.roleService.getPermissionsByCode(role)

  }
  
  
  async updateRefreshToken(
    userId: number,
    refreshToken: string | undefined,
  ): Promise<void> {
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

  async descativeUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 0 });
    return
  }
  async activateUser(id: number): Promise<any> {
    await this.userRepository.update(id, { status: 1 });
    return
  }*/
}
