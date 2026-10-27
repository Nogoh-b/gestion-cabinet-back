import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DataSource } from 'typeorm';

import { AiCreditsService } from 'src/modules/plans/ai-credits/ai-credits.service';
import { toUsd } from 'src/modules/plans/ai-credits/ai-credits';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { CurrentPlatformAdmin, PlatformPrincipal } from '../common/platform-principal';

class AiCreditPackDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  credits: number;

  @IsNumber()
  @Min(1)
  @Max(1_000_000_000)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}

class UpdateAiCreditPackDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) credits?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(1_000_000_000) price?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() sort_order?: number;
}

class AiCreditSettingsDto {
  /** Coût fournisseur (USD) d'un crédit. */
  @IsNumber()
  @Min(0.00000001)
  @Max(100)
  usd_per_credit: number;
}

class GrantCreditsDto {
  @IsNumber()
  @Min(0.0001)
  @Max(100_000_000)
  credits: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

class AiPurchasesQueryDto {
  @IsOptional()
  @IsIn(['pending', 'awaiting_validation', 'paid', 'failed', 'refunded', 'cancelled'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cabinet_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

const num = (value: unknown) => Number(value ?? 0) || 0;

/**
 * Crédits IA vus par la plateforme : packs vendus, réglage du crédit, achats
 * des cabinets (paiements `kind = 'ai_credits'`) et attributions manuelles.
 * Lecture : tous les rôles ; écriture : Propriétaire ou Finance.
 */
@ApiTags('Plateforme — Crédits IA')
@Controller('platform/ai-credits')
@PlatformRoute()
export class PlatformAiCreditsController {
  constructor(
    private readonly credits: AiCreditsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ── Réglage du crédit ────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Valeur d’un crédit IA (coût fournisseur en USD)' })
  settings() {
    return this.credits.loadSettings();
  }

  @Put('settings')
  @PlatformRoles('owner', 'finance')
  @PlatformAudit({ action: 'ai.credits.settings', targetType: 'platform_ai_credits' })
  @ApiOperation({ summary: 'Règle la valeur d’un crédit IA' })
  setSettings(@Body() body: AiCreditSettingsDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.credits.setUsdPerCredit(body.usd_per_credit, admin.id);
  }

  // ── Packs ────────────────────────────────────────────────────────────────

  @Get('packs')
  @ApiOperation({ summary: 'Packs de crédits IA (actifs ou non)' })
  async packs() {
    const [packs, settings, sold] = await Promise.all([
      this.credits.listPacks(),
      this.credits.loadSettings(),
      this.db.query(
        `SELECT ai_credit_pack_id AS pack_id, COUNT(*) AS n
           FROM subscription_payments
          WHERE kind = 'ai_credits' AND status IN ('paid','refunded') AND ai_credit_pack_id IS NOT NULL
          GROUP BY ai_credit_pack_id`,
      ),
    ]);
    const soldBy = new Map(sold.map((row: any) => [num(row.pack_id), num(row.n)]));
    return packs.map((pack) => ({
      ...pack,
      price: Number(pack.price),
      usd_cost: toUsd(pack.credits, settings.usd_per_credit),
      sold: soldBy.get(pack.id) ?? 0,
    }));
  }

  @Post('packs')
  @PlatformRoles('owner', 'finance')
  @PlatformAudit({ action: 'ai.credits.pack.create', targetType: 'ai_credit_pack' })
  @ApiOperation({ summary: 'Crée un pack de crédits IA' })
  createPack(@Body() body: AiCreditPackDto) {
    return this.credits.createPack(body);
  }

  @Put('packs/:id')
  @PlatformRoles('owner', 'finance')
  @PlatformAudit({ action: 'ai.credits.pack.update', targetType: 'ai_credit_pack', targetParam: 'id' })
  @ApiOperation({ summary: 'Modifie un pack (n’affecte pas les achats déjà faits)' })
  updatePack(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateAiCreditPackDto) {
    return this.credits.updatePack(id, body);
  }

  @Delete('packs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @PlatformRoles('owner', 'finance')
  @PlatformAudit({ action: 'ai.credits.pack.delete', targetType: 'ai_credit_pack', targetParam: 'id' })
  @ApiOperation({ summary: 'Supprime un pack jamais acheté' })
  async removePack(@Param('id', ParseIntPipe) id: number) {
    await this.credits.removePack(id);
  }

  // ── Achats ───────────────────────────────────────────────────────────────

  @Get('purchases')
  @ApiOperation({ summary: 'Achats de crédits IA de tous les cabinets' })
  async purchases(@Query() query: AiPurchasesQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const where = ["sp.kind = 'ai_credits'"];
    const params: unknown[] = [];
    if (query.status) {
      where.push('sp.status = ?');
      params.push(query.status);
    }
    if (query.cabinet_id) {
      where.push('sp.cabinet_id = ?');
      params.push(Number(query.cabinet_id));
    }
    if (query.search?.trim()) {
      const like = `%${query.search.trim()}%`;
      where.push('(c.name LIKE ? OR sp.reference LIKE ? OR sp.declared_reference LIKE ? OR p.name LIKE ?)');
      params.push(like, like, like, like);
    }
    const sql = `WHERE ${where.join(' AND ')}`;
    const from = `FROM subscription_payments sp
         JOIN cabinets c ON c.id = sp.cabinet_id
         LEFT JOIN ai_credit_packs p ON p.id = sp.ai_credit_pack_id
         LEFT JOIN platform_payment_methods pm ON pm.id = sp.payment_method_id`;
    const [rows, totals] = await Promise.all([
      this.db.query(
        `SELECT sp.id, sp.cabinet_id, c.name AS cabinet_name, sp.ai_credit_pack_id AS pack_id,
                p.name AS pack_name, sp.ai_credits AS credits, sp.amount, sp.currency, sp.status,
                sp.method, sp.provider, pm.label AS method_label, sp.reference, sp.declared_reference,
                sp.declared_at, sp.paid_at, sp.created_at, sp.failure_reason, sp.receipt_number,
                sp.refund_amount
           ${from} ${sql}
          ORDER BY COALESCE(sp.paid_at, sp.declared_at, sp.created_at) DESC, sp.id DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      ),
      this.db.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN sp.status IN ('paid','refunded') THEN sp.amount END), 0) AS collected,
                COALESCE(SUM(CASE WHEN sp.status IN ('paid','refunded') THEN sp.ai_credits END), 0) AS credits_sold,
                SUM(sp.status = 'awaiting_validation') AS awaiting_validation
           ${from} ${sql}`,
        params,
      ),
    ]);
    const total = num(totals[0]?.total);
    return {
      data: rows.map((row: any) => ({
        ...row,
        credits: row.credits === null ? null : num(row.credits),
        amount: num(row.amount),
        refund_amount: row.refund_amount === null ? null : num(row.refund_amount),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        collected: num(totals[0]?.collected),
        credits_sold: num(totals[0]?.credits_sold),
        awaiting_validation: num(totals[0]?.awaiting_validation),
      },
    };
  }
}

/** Crédits d'un cabinet : solde, historique du ledger, attribution manuelle. */
@ApiTags('Plateforme — Crédits IA')
@Controller('platform/cabinets/:cabinetId/ai-credits')
@PlatformRoute()
export class PlatformCabinetAiCreditsController {
  constructor(
    private readonly credits: AiCreditsService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Crédits IA du cabinet : position du mois et dernières écritures' })
  async overview(@Param('cabinetId', ParseIntPipe) cabinetId: number) {
    const [detail, ledger] = await Promise.all([
      this.credits.detail(cabinetId),
      this.db.query(
        `SELECT id, kind, credits, payment_id, period, note, created_by, created_at
           FROM ai_credit_ledger WHERE tenant_id = ? ORDER BY id DESC LIMIT 50`,
        [cabinetId],
      ),
    ]);
    return {
      ...detail,
      ledger: ledger.map((row: any) => ({ ...row, credits: num(row.credits) })),
    };
  }

  @Post('grant')
  @PlatformRoles('owner', 'finance')
  @PlatformAudit({
    action: 'ai.credits.grant',
    targetType: 'cabinet',
    cabinetParam: 'cabinetId',
    targetParam: 'cabinetId',
  })
  @ApiOperation({ summary: 'Attribue des crédits IA à un cabinet (geste commercial)' })
  grant(
    @Param('cabinetId', ParseIntPipe) cabinetId: number,
    @Body() body: GrantCreditsDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.credits.grant(cabinetId, body.credits, body.note, admin.id);
  }
}
