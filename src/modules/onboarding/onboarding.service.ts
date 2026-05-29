import {
  Injectable, Logger, ConflictException, InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { Cabinet, CabinetPlan } from '../cabinet/entities/cabinet.entity';
import { Branch } from '../agencies/branch/entities/branch.entity';
import { Employee, EmployeePosition } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { UserRole as UserRoleEntity } from '../iam/user-role/entities/user-role.entity';
import { UserRoleAssignment } from '../iam/user-role-assignment/entities/user-role-assignment.entity';
import { UserRole } from 'src/core/enums/user-role.enum';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { CabinetService } from '../cabinet/cabinet.service';
import { PlansService } from '../plans/plans.service';
import { OnboardingDto } from './onboarding.dto';
import { JwtPayload } from 'src/core/auth/interfaces/jwt-payload.interface';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Cabinet)          private cabinetRepo:    Repository<Cabinet>,
    @InjectRepository(Branch)           private branchRepo:     Repository<Branch>,
    @InjectRepository(Employee)         private employeeRepo:   Repository<Employee>,
    @InjectRepository(User)             private userRepo:       Repository<User>,
    @InjectRepository(UserRoleEntity)   private roleRepo:       Repository<UserRoleEntity>,
    @InjectRepository(UserRoleAssignment) private assignmentRepo: Repository<UserRoleAssignment>,
    private readonly tenantContext:  TenantContext,
    private readonly cabinetService: CabinetService,
    private readonly plansService:   PlansService,
    private readonly jwtService:     JwtService,
    private readonly dataSource:     DataSource,
  ) {}

  async register(dto: OnboardingDto) {
    // ── 0. Vérifier unicité email ─────────────────────────────────────────
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte avec cet email existe déjà');

    // ── 1. Résoudre le plan choisi (ou 'free' par défaut) ─────────────
    const planCode = dto.plan_code ?? 'free';
    const selectedPlan = await this.plansService.findByCode(planCode)
      .catch(() => null);

    // ── 2. Créer le cabinet (pas encore de tenant context) ────────────────
    const cabinet = this.cabinetRepo.create({
      code:         this.cabinetService.generateCode(),
      name:         dto.cabinet_name.trim(),
      status:       'trial',
      plan:         planCode as CabinetPlan,
      plan_id:      selectedPlan?.id ?? null,
      routing_mode: dto.routing_mode ?? 'path',
      trial_ends_at: this.trialEnd(30),
    });
    await this.cabinetRepo.save(cabinet);
    this.logger.log(`[Onboarding] Cabinet créé — id=${cabinet.id} code="${cabinet.code}" plan="${planCode}" plan_id=${selectedPlan?.id ?? 'none'}`);

    // ── 2. Tout le reste dans le contexte du nouveau tenant ───────────────
    try {
      // AsyncLocalStorage.run() retourne la valeur renvoyée par le callback.
      // Comme le callback est async, il retourne une Promise — await ci-dessous
      // attend la résolution complète avant de lire le résultat.
      const registrationResult = await this.tenantContext.run(cabinet.id, async () => {
        // 2a. Branche principale — code dérivé du cabinet pour unicité per-tenant
        const branchCode = `HQ-${cabinet.code.slice(0, 6).toUpperCase()}`;
        const branchDraft = this.branchRepo.create({
          code:         branchCode,
          name:         'Siège Social',
          opening_hour: '08:00',
          closing_hour: '18:00',
          status:       1,
        });
        const savedBranch = await this.branchRepo.save(branchDraft) as unknown as Branch;

        // 2b. User
        const hashedPwd = await bcrypt.hash(dto.password, 10);
        const userDraft = this.userRepo.create({
          username:   dto.email,
          email:      dto.email,
          first_name: dto.first_name.trim(),
          last_name:  dto.last_name.trim(),
          password:   hashedPwd,
          status:     1,
          role:       UserRole.ADMIN,
        });
        const savedUser = await this.userRepo.save(userDraft) as unknown as User;

        // 2c. Employee lié à la branche
        const employeeDraft = this.employeeRepo.create({
          position: EmployeePosition.AVOCAT,
          status:   1,
          user:     savedUser,
          branch:   savedBranch,
        });
        await this.employeeRepo.save(employeeDraft);

        // 2d. Rôle admin (cherché globalement — UserRole n'est pas tenant-scoped)
        const adminRole = await this.roleRepo.findOne({ where: { code: 'admin' } });
        if (adminRole) {
          const assignment = this.assignmentRepo.create({
            user_id: savedUser.id,
            role_id: adminRole.id,
            status:  1,
          });
          await this.assignmentRepo.save(assignment);
        }

        // ── 3. Génération du JWT ─────────────────────────────────────────
        const payload: JwtPayload = {
          sub:         savedUser.id,
          username:    savedUser.email,
          role:        UserRole.ADMIN,
          permissions: [],
          tenantId:    cabinet.id,
        };
        const access_token = this.jwtService.sign(payload);

        // ── 4. URL d'accès ───────────────────────────────────────────────
        const tenant_url = this.cabinetService.getCabinetUrl(cabinet);

        // ── 5. Retour — valeur propagée via la Promise de run() ──────────
        return {
          success: true,
          cabinet: {
            id:           cabinet.id,
            code:         cabinet.code,
            name:         cabinet.name,
            status:       cabinet.status,
            routing_mode: cabinet.routing_mode,
          },
          user: {
            id:         savedUser.id,
            email:      savedUser.email,
            first_name: savedUser.first_name,
            last_name:  savedUser.last_name,
          },
          access_token,
          tenant_url,
        };
      });

      return registrationResult;

    } catch (raw) {
      const err = raw as Error;
      // Rollback partiel : supprimer le cabinet créé si le reste a échoué
      this.logger.error(`[Onboarding] Erreur — suppression cabinet id=${cabinet.id}`, err.stack);
      await this.cabinetRepo.delete(cabinet.id).catch(() => {});
      throw new InternalServerErrorException(`Erreur lors de la création du cabinet : ${err.message}`);
    }
  }

  private trialEnd(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }
}
