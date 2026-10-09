import * as bcrypt from 'bcrypt';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { plainToInstance } from 'class-transformer';
import { UserRole } from 'src/core/enums/user-role.enum';

import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  generateUsernameBase,
  joinFullName,
  splitFullName,
} from 'src/core/shared/utils/full-name.util';

import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';

import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';

import { User } from 'src/modules/iam/user/entities/user.entity';

import { UsersService } from 'src/modules/iam/user/user.service';

import { Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Branch } from '../branch/entities/branch.entity';
import { EmployeeResponseDto } from './dto/response-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import {
  Employee,
  EmployeePosition,
  EmployeeStatus,
} from './entities/employee.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { MailTemplateService } from 'src/modules/mail-template/mail-template.service';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { UserRole as UserRoleEntity } from 'src/modules/iam/user-role/entities/user-role.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
// import { EmailService } from 'src/core/shared/services/email/email.service copy';

@Injectable()
export class EmployeeService extends BaseServiceV1<Employee> {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserRoleEntity)
    private userRoleRepository: Repository<UserRoleEntity>,
    @InjectRepository(UserRoleAssignment)
    private userRoleAssignmentRepository: Repository<UserRoleAssignment>,
    // private mailerService: EmailService,
    private userService: UsersService,
    private mailService: MailService,
    private readonly mailTemplateService: MailTemplateService,
    private readonly planQuotaService: PlanQuotaService,
    protected readonly paginationService: PaginationServiceV1,
  ) {
    super(employeeRepository, paginationService);
  }
  /** Options de recherche propres aux collaborateurs. */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [
        'user.first_name',
        'user.last_name',
        'user.email',
        'user.username',
        'branch.name',
        'employee_number',
        'specialization',
        'bar_association_number',
        'bar_association_city',
        'professional_address',
        'professional_phone',
        'siret_number',
        'tva_number',
        'managed_dossiers.dossier_number',
      ],
      exactMatchFields: [
        'id',
        'status',
        'position',
        'branch_id',
        'is_available',
      ],
      dateRangeFields: ['hireDate', 'birth_date', 'created_at', 'updated_at'],
      relationFields: [
        'user',
        'branch',
        'managed_dossiers',
        'collaborating_dossiers',
      ],
    };
  }

  async createEmployee(
    dto: CreateUserDto,
    is_strict = true,
  ): Promise<EmployeeResponseDto> {
    // ── Vérification quota plan ────────────────────────────────────────────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      const currentCount = await this.employeeRepository.count();
      await this.planQuotaService.checkLimit(
        tenantId,
        'employees',
        currentCount,
      );
    }

    // Vérification de la branche. Création minimale (sans `branch_id`,
    // depuis un select « + Créer », uniquement `full_name`) : on retombe sur
    // la première agence active, sans bloquer si aucune n'est configurée
    // (`branch_id` est nullable côté entité).
    const branch = dto.branch_id
      ? await this.branchRepository.findOne({
          where: { id: dto.branch_id, status: 1 },
        })
      : await this.branchRepository.findOne({
          where: { status: 1 },
          order: { id: 'ASC' },
        });

    if (!branch && dto.branch_id) {
      throw new NotFoundException('Branche non trouvée ou inactive');
    }

    // Fonction facultative en création minimale : collaborateur par défaut.
    const position = dto.position ?? EmployeePosition.COLLABORATEUR;
    const defaultRole = this.getUserRoleFromPosition(position);
    const requestedRoleCode = dto.role?.trim() || defaultRole;
    // Résolution stricte (tenant courant uniquement, sans repli tenant 1).
    // On ne bloque plus la création si le profil est absent en DB : l'employé
    // est créé avec `user.role` renseigné, sans ligne d'assignation.
    const accessProfile = await this.resolveAccessProfile(requestedRoleCode);
    if (!accessProfile) {
      console.warn(
        `[Employee] Profil d'accès actif introuvable pour le code '${requestedRoleCode}' — création sans assignation de rôle.`,
      );
    }

    // Vérification des doublons d'email — uniquement si un email est fourni
    // (création minimale : l'email est facultatif, un `undefined` ne doit
    // pas déclencher une recherche non filtrée).
    if (dto.email) {
      const existingUser = await this.repository.findOne({
        where: { user: { email: dto.email } },
      });

      if (existingUser && is_strict) {
        throw new ConflictException(
          'Un utilisateur avec cet email existe déjà',
        );
      }
    }
    // Nom et prénom : le formulaire envoie désormais `full_name` en un seul
    // champ ; `first_name`/`last_name` restent acceptés isolément (compat
    // ascendante). `User.syncNameFields()` dérive le champ manquant à la
    // sauvegarde — on exige seulement qu'au moins une des deux formes arrive.
    if (
      !dto.full_name?.trim() &&
      !dto.first_name?.trim() &&
      !dto.last_name?.trim()
    ) {
      throw new BadRequestException(
        'Le nom du collaborateur est obligatoire (nom et prénom).',
      );
    }

    const plain_password = this.generate_temp_password(12);
    const hashed_password = await bcrypt.hash(plain_password, 10);

    // Identifiant de connexion : l'email si fourni, sinon un identifiant
    // généré depuis le nom (création minimale — l'email reste NULL et sera
    // complété plus tard depuis la fiche employé, comme les autres champs
    // de coordonnées facultatifs).
    const username = dto.email
      ? dto.email
      : await this.generateUniqueUsername(
          dto.full_name || joinFullName(dto.first_name, dto.last_name),
        );

    // Création de l'utilisateur
    const user = this.userRepo.create({
      full_name: dto.full_name,
      first_name: dto.first_name,
      last_name: dto.last_name,
      email: dto.email,
      username,
      status: 1, // Actif par défaut
      password: hashed_password,
      // phoneNumber: dto.phone_number,
      role: requestedRoleCode as UserRole,
      // isActive: true,
    });

    const savedUser = await this.userRepo.save(user);

    if (accessProfile) {
      await this.userRoleAssignmentRepository.save(
        this.userRoleAssignmentRepository.create({
          user_id: savedUser.id,
          role_id: accessProfile.id,
          status: 1,
        }),
      );
    }

    // Création de l'employé avec tous les champs
    const employeeData: Partial<Employee> = {
      user: savedUser,
      id: savedUser.id, // Utiliser le même ID !
      branch: branch || undefined,
      position,
      hireDate: dto.hire_date ? new Date(dto.hire_date) : new Date(),
      status: EmployeeStatus.ACTIVE,
      specialization: dto.specialization,
      bar_association_number: dto.bar_association_number,
      bar_association_city: dto.bar_association_city,
      years_of_experience: dto.years_of_experience,
      hourly_rate: dto.hourly_rate,
      salary: dto.salary,
      is_available: dto.is_available ?? true,
      max_dossiers: dto.max_dossiers ?? 50,
      bio: dto.bio,
      languages: dto.languages,
      expertise_areas: dto.expertise_areas,
      birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
      birth_place: dto.birth_place,
      home_address: dto.home_address,
      personal_phone: dto.personal_phone ?? dto.phone_number,
      marital_status: dto.marital_status,
      children_count: dto.children_count ?? 0,
      professional_address: dto.professional_address,
      professional_phone: dto.professional_phone,
      siret_number: dto.siret_number,
      tva_number: dto.tva_number,
    };

    const employee = await this.employeeRepository.save(
      this.employeeRepository.create(employeeData),
    );

    // Envoi des identifiants de connexion au nouveau collaborateur avec son
    // mot de passe temporaire RÉEL (à changer à la première connexion).
    // Template DB `employee_credentials` en priorité, repli sur le template fichier.
    // Un échec d'envoi ne doit pas bloquer la création du collaborateur.
    // Création minimale (sans email) : rien à envoyer — l'email reste un
    // champ « à compléter » sur la fiche employé, et la connexion se fait
    // par email (cf. `AuthService.validateUser`), donc impossible tant qu'il
    // n'est pas renseigné.
    const recipientEmail = savedUser.email;
    if (recipientEmail) {
      const frontendUrl = (process.env.APP_FRONTEND_URL ?? '').replace(
        /\/$/,
        '',
      );
      const loginUrl = frontendUrl ? `${frontendUrl}/auth/login` : '';
      const firstName = savedUser.first_name ?? '';
      try {
        const rendered =
          await this.mailTemplateService.renderOrCreateSystemDefault(
            'employee_credentials',
            {
              firstName,
              email: recipientEmail,
              tempPassword: plain_password,
              loginUrl,
            },
          );
        await this.mailService.sendDirect({
          to: recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
        });
      } catch (mailErr) {
        // Repli : template fichier existant (welcome-password)
        try {
          await this.mailService.sendWelcomeWithPasswordEmail(
            {
              ...employee,
              user: savedUser,
              email: recipientEmail,
              first_name: firstName,
              last_name: savedUser.last_name ?? '',
            },
            plain_password,
          );
        } catch (fallbackErr) {
          console.error(
            `Échec envoi email identifiants employé ${employee.id} (${recipientEmail}):`,
            (fallbackErr as Error)?.message ?? fallbackErr,
          );
        }
      }
    }

    return plainToInstance(EmployeeResponseDto, employee);
  }

  /**
   * Génère un identifiant de connexion unique à partir d'un nom complet
   * (création minimale sans email). Base slugifiée + suffixe numérique
   * incrémental en cas de collision.
   */
  private async generateUniqueUsername(fullName: string): Promise<string> {
    const base = generateUsernameBase(fullName);
    let candidate = base;
    let suffix = 1;
    while (await this.userRepo.findOne({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }

  /**
   * Résout un profil d'accès (`user_role`) par son code — isolation stricte :
   * UNIQUEMENT le tenant courant (WHERE tenant_id = X). Aucun repli vers le
   * tenant 1 ni recherche sans filtre : un cabinet ne doit jamais hériter
   * des rôles d'un autre cabinet.
   * Retourne `null` si aucun profil actif ne correspond — l'appelant ne doit
   * pas bloquer la création/mise à jour dans ce cas.
   */
  private async resolveAccessProfile(code: string) {
    const tenantId = getCurrentTenantId();
    if (tenantId === undefined || tenantId === null) return null;
    return this.userRoleRepository
      .createQueryBuilder('r')
      .where('r.code = :code', { code })
      .andWhere('r.status = 1')
      .andWhere('r.tenant_id = :tid', { tid: tenantId })
      .getOne();
  }

  // Méthode helper pour déterminer le rôle utilisateur
  private getUserRoleFromPosition(position: EmployeePosition): UserRole {
    switch (position) {
      case EmployeePosition.AVOCAT:
        return UserRole.AVOCAT;
      case EmployeePosition.COLLABORATEUR:
      case EmployeePosition.JURISTE:
      case EmployeePosition.ASSISTANT:
        return UserRole.COLLABORATEUR;
      case EmployeePosition.COMPTABLE:
        return UserRole.COMPTABLE;
      case EmployeePosition.SECRETAIRE:
      case EmployeePosition.ADMINISTRATIF:
        return UserRole.SECRETAIRE;
      case EmployeePosition.HUISSIER:
        return UserRole.HUISSIER;
      case EmployeePosition.STAGIAIRE:
        return UserRole.STAGIAIRE;
      case EmployeePosition.SUPPORT:
        return UserRole.SUPPORT;
      case EmployeePosition.APPORTEUR_AFFAIRE:
        return UserRole.APPORTEUR_AFFAIRE;
      default:
        return UserRole.SECRETAIRE;
    }
  }

  async updateEmployee(
    id: number,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    // ── Chargement employé + user ──────────────────────────────────────────
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: { user: true, branch: true },
    });
    if (!employee || !employee.user) {
      throw new NotFoundException(`Employé ${id} introuvable`);
    }
    const user = employee.user;
    const tenantId = getCurrentTenantId();

    // ── Branche ────────────────────────────────────────────────────────────
    if (dto.branch_id !== undefined && dto.branch_id !== null) {
      const branch = await this.branchRepository.findOne({
        where: { id: Number(dto.branch_id), status: 1 },
      });
      if (!branch) {
        throw new NotFoundException('Branche non trouvée ou inactive');
      }
      employee.branch = branch;
    }

    // ── Email (unicité + sync username) ────────────────────────────────────
    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (existing && existing.id !== user.id) {
        throw new ConflictException(
          'Un utilisateur avec cet email existe déjà',
        );
      }
      user.email = dto.email;
      user.username = dto.email;
    }

    // ── Nom et prénom ────────────────────────────────────────────────────────
    // Traité explicitement ici plutôt que via le hook `syncNameFields()` de
    // l'entité : sur une mise à jour, first_name/last_name portent déjà les
    // anciennes valeurs chargées depuis la base, donc le hook ne peut pas à
    // lui seul distinguer un `full_name` réellement modifié d'un reliquat.
    if (dto.full_name !== undefined && dto.full_name.trim()) {
      const { first_name, last_name } = splitFullName(dto.full_name);
      user.full_name = dto.full_name.trim();
      user.first_name = first_name || user.first_name;
      user.last_name = last_name || user.last_name;
    } else {
      if (dto.first_name !== undefined) user.first_name = dto.first_name;
      if (dto.last_name !== undefined) user.last_name = dto.last_name;
      if (dto.first_name !== undefined || dto.last_name !== undefined) {
        user.full_name = joinFullName(user.first_name, user.last_name);
      }
    }

    // ── Position / profil d'accès ──────────────────────────────────────────
    const newPosition = dto.position ?? employee.position;
    if (dto.position !== undefined) employee.position = dto.position;
    const requestedRoleCode =
      dto.role?.trim() || this.getUserRoleFromPosition(newPosition);
    if (requestedRoleCode && requestedRoleCode !== user.role) {
      const accessProfile = await this.resolveAccessProfile(requestedRoleCode);
      user.role = requestedRoleCode as UserRole;
      if (!accessProfile) {
        console.warn(
          `[Employee] Profil d'accès actif introuvable pour le code '${requestedRoleCode}' — rôle mis à jour sans réassignation.`,
        );
      } else {
        await this.userRoleAssignmentRepository.update(
          { user_id: user.id, status: 1 } as any,
          { status: 0 } as any,
        );
        await this.userRoleAssignmentRepository.save(
          this.userRoleAssignmentRepository.create({
            user_id: user.id,
            role_id: accessProfile.id,
            status: 1,
          }),
        );
      }
    }

    // ── Champs employé ─────────────────────────────────────────────────────
    if (
      dto.hire_date !== undefined &&
      dto.hire_date !== null &&
      dto.hire_date !== ''
    ) {
      employee.hireDate = new Date(dto.hire_date as any);
    }
    if (
      (dto as any).hireDate !== undefined &&
      (dto as any).hireDate !== null &&
      (dto as any).hireDate !== ''
    ) {
      employee.hireDate = new Date((dto as any).hireDate);
    }
    if ((dto as any).status !== undefined) {
      employee.status = this.mapStatusToEnum((dto as any).status);
    }
    if (dto.specialization !== undefined)
      employee.specialization = dto.specialization;
    if (dto.bar_association_number !== undefined)
      employee.bar_association_number = dto.bar_association_number;
    if (dto.bar_association_city !== undefined)
      employee.bar_association_city = dto.bar_association_city;
    if (dto.years_of_experience !== undefined)
      employee.years_of_experience = dto.years_of_experience;
    if (dto.hourly_rate !== undefined) employee.hourly_rate = dto.hourly_rate;
    if (dto.salary !== undefined) employee.salary = dto.salary;
    if (dto.is_available !== undefined)
      employee.is_available = dto.is_available;
    if (dto.max_dossiers !== undefined)
      employee.max_dossiers = dto.max_dossiers;
    if (dto.bio !== undefined) employee.bio = dto.bio;
    if (dto.languages !== undefined) employee.languages = dto.languages;
    if (dto.expertise_areas !== undefined)
      employee.expertise_areas = dto.expertise_areas;
    if (
      dto.birth_date !== undefined &&
      dto.birth_date !== null &&
      dto.birth_date !== ''
    ) {
      employee.birth_date = new Date(dto.birth_date as any);
    }
    if (dto.birth_place !== undefined) employee.birth_place = dto.birth_place;
    if (dto.home_address !== undefined)
      employee.home_address = dto.home_address;
    if (dto.marital_status !== undefined)
      employee.marital_status = dto.marital_status;
    if (dto.children_count !== undefined)
      employee.children_count = dto.children_count;
    if (dto.professional_address !== undefined)
      employee.professional_address = dto.professional_address;
    // `phone_number` du formulaire n'a pas de colonne user dédiée :
    // on le répercute sur le téléphone professionnel s'il n'est pas fourni.
    if (dto.professional_phone !== undefined) {
      employee.professional_phone = dto.professional_phone;
    } else if ((dto as any).phone_number) {
      employee.professional_phone = (dto as any).phone_number;
    }
    if (dto.personal_phone !== undefined) {
      employee.personal_phone = dto.personal_phone;
    } else if ((dto as any).phone_number && !employee.personal_phone) {
      employee.personal_phone = (dto as any).phone_number;
    }
    if (dto.siret_number !== undefined)
      employee.siret_number = dto.siret_number;
    if (dto.tva_number !== undefined) employee.tva_number = dto.tva_number;

    await this.userRepo.save(user);
    await this.employeeRepository.save(employee);

    return plainToInstance(
      EmployeeResponseDto,
      await this.employeeRepository.findOne({
        where: { id },
        relations: { user: true, branch: true },
      }),
    );
  }

  /** Convertit le statut du formulaire (texte ou numérique) vers l'enum BD. */
  private mapStatusToEnum(status: string | number): EmployeeStatus {
    if (typeof status === 'number' || /^-?\d+$/.test(String(status))) {
      const n = Number(status);
      if (n === 1) return EmployeeStatus.ACTIVE;
      if (n === 0) return EmployeeStatus.INACTIVE;
      if (n === -1) return EmployeeStatus.SUSPENDED;
      if (n === 2) return EmployeeStatus.VACATION;
      return EmployeeStatus.ACTIVE;
    }
    switch (String(status).toLowerCase()) {
      case 'active':
      case 'actif':
        return EmployeeStatus.ACTIVE;
      case 'inactive':
      case 'inactif':
        return EmployeeStatus.INACTIVE;
      case 'suspended':
      case 'suspendu':
        return EmployeeStatus.SUSPENDED;
      case 'on_leave':
      case 'vacation':
      case 'training':
      case 'sick_leave':
      case 'conge':
        return EmployeeStatus.VACATION;
      default:
        return EmployeeStatus.ACTIVE;
    }
  }

  async findAllEmployees(
    branch_id: number = 0,
  ): Promise<EmployeeResponseDto[]> {
    let qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect(
        'employee.collaborating_dossiers',
        'collaborating_dossiers',
      )
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
      .where('user.status = 1');

    qb = addTenantCondition(qb, 'employee');
    const employees = await qb.getMany();
    return plainToInstance(EmployeeResponseDto, employees);
  }

  async findOneByUsername(
    username: string,
    is_strict = true,
  ): Promise<EmployeeResponseDto> {
    let qb = this.employeeRepository
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
      .andWhere('user.status = 1');

    qb = addTenantCondition(qb, 'employee');
    const employee = await qb.getOne();

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
    let qb = this.employeeRepository
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
      .andWhere('user.status = 1');

    // ── Filtre tenant obligatoire ─────────────────────────────────────────
    // Les QueryBuilders ne passent pas par TenantRepositoryPatch (qui ne couvre
    // que les méthodes find* du Repository). addTenantCondition injecte
    // WHERE employee.tenant_id = <currentTenantId> en lisant AsyncLocalStorage.
    qb = addTenantCondition(qb, 'employee');
    // ─────────────────────────────────────────────────────────────────────

    const employee = await qb.getOne();

    if (!employee && is_strict) {
      throw new NotFoundException(`Employee with email ${email} not found`);
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
    // await this.mailerService.sendPasswordResetEmail(user.email, html);
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

    const frontendUrl = (process.env.APP_FRONTEND_URL ?? '').replace(/\/$/, '');
    const loginUrl = frontendUrl ? `${frontendUrl}/auth/login` : '';
    try {
      const rendered =
        await this.mailTemplateService.renderOrCreateSystemDefault(
          'employee_credentials',
          {
            firstName: (user as any).first_name ?? '',
            email: user.email,
            tempPassword: plain_password,
            loginUrl,
          },
        );
      await this.mailService.sendDirect({
        to: user.email,
        subject: rendered.subject || 'Votre nouveau mot de passe',
        html: rendered.html,
      });
    } catch {
      await this.mailService.sendDirect({
        to: user.email,
        subject: 'Votre nouveau mot de passe',
        html,
      });
    }

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
