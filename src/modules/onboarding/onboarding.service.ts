import {
  Injectable, Logger, ConflictException, InternalServerErrorException,
  BadRequestException,
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
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { OnboardingDto } from './onboarding.dto';
import { JwtPayload } from 'src/core/auth/interfaces/jwt-payload.interface';
import { MailService } from 'src/core/shared/emails/emails.service';
import { MailTemplateService } from '../mail-template/mail-template.service';

const LEGACY_PLAN_CODE_ALIASES: Record<string, string> = {
  starter: 'avocat',
  pro: 'cabinet',
  business: 'firme',
  enterprise: 'firme',
};

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
    private readonly subscriptionsService: SubscriptionsService,
    private readonly jwtService:     JwtService,
    private readonly dataSource:     DataSource,
    private readonly mailService:    MailService,
    private readonly mailTemplateService: MailTemplateService,
  ) {}

  /**
   * Email de bienvenue au nouveau cabinet (souscription).
   * Rend le template DB `tenant_welcome` (avec repli sur un HTML inline si le
   * template n'est pas encore seedé pour ce tenant). Ne lève JAMAIS d'erreur
   * pour ne pas annuler la création du cabinet.
   */
  private async sendTenantWelcome(to: string, ctx: Record<string, any>): Promise<void> {
    try {
      let subject = `Bienvenue sur ${ctx.appName}, ${ctx.cabinetName} !`;
      let html =
        `<h2 style="margin-top:0;">Bienvenue ${ctx.firstName},</h2>` +
        `<p>Le cabinet <strong>${ctx.cabinetName}</strong> a été créé avec succès.</p>` +
        `<p>Votre code cabinet : <strong>${ctx.tenantCode}</strong></p>` +
        `<p style="margin:24px 0;"><a href="${ctx.loginUrl}" style="background:${ctx.brandColor};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Accéder à mon cabinet</a></p>`;
      try {
        const rendered = await this.mailTemplateService.renderOrCreateSystemDefault('tenant_welcome', ctx);
        if (rendered?.html) {
          subject = rendered.subject || subject;
          html = rendered.html;
        }
      } catch {
        // Template non disponible pour ce tenant → on garde le repli inline.
      }
      // sendDirect attend le vrai envoi SMTP (contrairement à create() qui est
      // fire-and-forget) → on remonte les erreurs d'envoi dans le log ci-dessous.
      await this.mailService.sendDirect({ to, subject, html });
      this.logger.log(`[Onboarding] Email de bienvenue envoyé à ${to}`);
    } catch (err) {
      this.logger.warn(`[Onboarding] Email de bienvenue NON envoyé à ${to} : ${(err as Error)?.message}`);
    }
  }

  async register(dto: OnboardingDto) {
    // ── 0. Vérifier unicité email ─────────────────────────────────────────
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte avec cet email existe déjà');

    // ── 1. Résoudre le plan choisi (ou 'free' par défaut) ─────────────
    const requestedPlanCode = dto.plan_code?.trim().toLowerCase() || 'free';
    let selectedPlan = await this.plansService.findByCode(requestedPlanCode);
    if (!selectedPlan && LEGACY_PLAN_CODE_ALIASES[requestedPlanCode]) {
      selectedPlan = await this.plansService.findByCode(
        LEGACY_PLAN_CODE_ALIASES[requestedPlanCode],
      );
    }
    if (!selectedPlan || !selectedPlan.is_active) {
      throw new BadRequestException(
        `Le plan "${requestedPlanCode}" est introuvable ou indisponible`,
      );
    }
    const planCode = selectedPlan.code;

    // ── 2. Créer le cabinet (pas encore de tenant context) ────────────────
    const cabinet = this.cabinetRepo.create({
      code:         this.cabinetService.generateCode(),
      name:         dto.cabinet_name.trim(),
      status:       'trial',
      plan:         planCode as CabinetPlan,
      plan_id:      selectedPlan.id,
      routing_mode: dto.routing_mode ?? 'path',
      trial_ends_at: selectedPlan.trial_enabled
        ? this.trialEnd(selectedPlan.trial_days)
        : null,
    });
    await this.cabinetRepo.save(cabinet);
    this.logger.log(`[Onboarding] Cabinet créé — id=${cabinet.id} code="${cabinet.code}" plan="${planCode}" plan_id=${selectedPlan.id}`);

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

        // ── 2e. Abonnement + échéance de facturation ─────────────────────
        // Crée l'abonnement selon la politique configurée (essai 30j par
        // défaut). Synchronise le statut + trial_ends_at du cabinet.
        // À l'inscription : tout plan PAYANT exige le paiement d'abord (même
        // s'il propose un essai). L'essai est conservé et démarre après paiement.
        // Plan gratuit → accès direct.
        const subscription = await this.subscriptionsService.createForCabinet(
          cabinet.id,
          selectedPlan.id,
          dto.billing_cycle ?? 'monthly',
          { gateAllPaid: true },
        );
        // Reflète le statut résolu sur l'objet en mémoire pour la réponse.
        // Plan payant sans essai → pending_payment → cabinet suspendu (paiement requis).
        cabinet.status =
          subscription.status === 'trial'
            ? 'trial'
            : subscription.status === 'pending_payment'
            ? 'suspended'
            : 'active';

        // ── 3. Génération du JWT ─────────────────────────────────────────
        const payload: JwtPayload = {
          sub:         savedUser.id,
          username:    savedUser.email,
          role:        UserRole.ADMIN,
          permissions: [],
          tenantId:    cabinet.id,
        };
        const refreshSecret = process.env.JWT_REFRESH_SECRET;
        if (!refreshSecret) {
          throw new Error('JWT_REFRESH_SECRET est obligatoire');
        }
        const [access_token, refresh_token] = await Promise.all([
          this.jwtService.signAsync(payload, { expiresIn: '15m' }),
          this.jwtService.signAsync(payload, {
            secret: refreshSecret,
            expiresIn: '7d',
          }),
        ]);
        savedUser.refreshToken = await bcrypt.hash(refresh_token, 10);
        await this.userRepo.save(savedUser);

        // ── 4. URL d'accès ───────────────────────────────────────────────
        const tenant_url = this.cabinetService.getCabinetUrl(cabinet);

        // ── 4b. Email de bienvenue au cabinet (ne bloque jamais l'onboarding) ──
        await this.sendTenantWelcome(savedUser.email, {
          firstName:   savedUser.first_name,
          cabinetName: cabinet.name,
          appName:     'KabySoft',
          loginUrl:    tenant_url,
          tenantCode:  cabinet.code,
          brandColor:  '#1d4ed8',
        });

        // ── 5. Retour — valeur propagée via la Promise de run() ──────────
        return {
          success: true,
          // Vrai quand un paiement doit être réglé avant l'accès (plan payant
          // sans essai). Le front oriente alors vers l'étape de paiement.
          requires_payment: subscription.status === 'pending_payment',
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
          refresh_token,
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

  /**
   * Liste publique des plans actifs — utilisée par l'écran d'inscription
   * (non authentifié) pour proposer TOUS les plans, pas seulement le Starter.
   */
  async listActivePlans() {
    return this.plansService.findActive();
  }

  private trialEnd(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }
}
