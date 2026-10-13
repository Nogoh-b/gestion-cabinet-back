import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from 'src/modules/plans/plans.service';
import { CreatePlanDto } from 'src/modules/plans/dto/create-plan.dto';
import { UpdatePlanDto } from 'src/modules/plans/dto/update-plan.dto';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { PlatformAuditContext } from '../audit/platform-audit.context';

/** Catalogue des plans (offre SaaS) — édition réservée Propriétaire / Finance. */
@ApiTags('Plateforme — Plans')
@Controller('platform/plans')
@PlatformRoute()
export class PlatformPlansController {
  constructor(
    private readonly plans: PlansService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tous les plans, avec le nombre de cabinets abonnés' })
  async list() {
    const plans = await this.plans.findAll();
    const usage: Array<{ plan_id: number; live: string; total: string }> =
      await this.db.query(
        `SELECT plan_id,
                SUM(status IN ('trial','active','pending_payment')) AS live,
                COUNT(*) AS total
           FROM subscriptions GROUP BY plan_id`,
      );
    const byPlan = new Map(usage.map((u) => [Number(u.plan_id), u]));
    return plans.map((plan) => ({
      ...plan,
      live_subscriptions: Number(byPlan.get(plan.id)?.live ?? 0),
      total_subscriptions: Number(byPlan.get(plan.id)?.total ?? 0),
    }));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.plans.findOne(id);
  }

  @Post()
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'plan.create', targetType: 'plan' })
  @ApiOperation({ summary: 'Créer un plan' })
  async create(@Body() dto: CreatePlanDto) {
    const plan = await this.plans.create(dto);
    PlatformAuditContext.set({ targetId: plan.id, after: plan as any, summary: `Plan ${plan.name}` });
    return plan;
  }

  @Patch(':id')
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'plan.update', targetType: 'plan' })
  @ApiOperation({ summary: 'Modifier un plan (tarifs, quotas, modules, essai)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const before = { ...(await this.plans.findOne(id)) };
    const plan = await this.plans.update(id, dto);
    PlatformAuditContext.set({ before: before as any, after: plan as any, summary: `Plan ${plan.name}` });
    return plan;
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'plan.toggle', targetType: 'plan' })
  @ApiOperation({ summary: 'Activer / désactiver un plan (plus proposé aux nouveaux cabinets)' })
  async toggle(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.plans.findOne(id);
    const updated = await this.plans.update(id, { is_active: !plan.is_active } as UpdatePlanDto);
    PlatformAuditContext.set({
      before: { is_active: plan.is_active },
      after: { is_active: updated.is_active },
      summary: `${updated.is_active ? 'Activation' : 'Désactivation'} du plan ${plan.name}`,
    });
    return updated;
  }

  @Delete(':id')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'plan.delete', targetType: 'plan' })
  @ApiOperation({ summary: 'Supprimer un plan jamais souscrit (sinon : désactiver)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    const [{ n }] = await this.db.query(
      `SELECT (SELECT COUNT(*) FROM subscriptions WHERE plan_id = ?)
            + (SELECT COUNT(*) FROM cabinets WHERE plan_id = ?) AS n`,
      [id, id],
    );
    if (Number(n) > 0) {
      throw new ConflictException(
        'Ce plan a déjà été souscrit : désactivez-le plutôt que de le supprimer.',
      );
    }
    const plan = await this.plans.findOne(id);
    await this.plans.remove(id);
    PlatformAuditContext.set({ before: plan as any, summary: `Plan ${plan.name} supprimé` });
    return { success: true };
  }
}
