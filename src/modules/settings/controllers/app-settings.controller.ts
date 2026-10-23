import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { isClientUser } from 'src/core/auth/client-access';
import { AllowClient } from 'src/core/decorators/allow-client.decorator';
import { AppSettingsService } from '../services/app-settings.service';
import { UserSettingsService } from '../services/user-settings.service';
import { AppSettingsDto } from '../dto/app-settings.dto';
import { serializeCabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { SmtpService } from 'src/core/shared/emails/smtp.service';
import { maskSmtpConfig } from '../smtp-config.util';
import { Request } from 'express';

function isAdminRequest(req: Request): boolean {
  const user = req.user as any;
  return (
    user?.role === 'admin' ||
    (Array.isArray(user?.permissions) &&
      user.permissions.includes('SUPER_ADMIN'))
  );
}

/**
 * Modifier la configuration du cabinet (identité, numérotation, SMTP,
 * apparence par défaut des nouveaux membres…) est réservé aux
 * administrateurs. L'apparence personnelle passe par /api/settings/user.
 */
function canManageSettings(req: Request): boolean {
  const user = req.user as any;
  return (
    isAdminRequest(req) ||
    (Array.isArray(user?.permissions) &&
      user.permissions.includes('manage_settings'))
  );
}

function assertCanManageSettings(req: Request): void {
  if (!canManageSettings(req)) {
    throw new ForbiddenException(
      'Seul un administrateur du cabinet peut modifier ces paramètres.',
    );
  }
}

/**
 * La configuration IA (fournisseurs, clés) relève de la console plateforme :
 * elle n'est jamais renvoyée au cabinet, même à son administrateur.
 * La configuration SMTP n'est renvoyée qu'à ceux qui gèrent les paramètres,
 * et son mot de passe est toujours masqué.
 */
function settingsResponse(cabinet: any, includeSmtp: boolean): any {
  const copy = { ...cabinet };
  delete copy.ai_config;
  if (includeSmtp) {
    copy.smtp_config = maskSmtpConfig(copy.smtp_config);
  } else {
    delete copy.smtp_config;
  }
  return copy;
}

/**
 * Ce que le portail client voit du cabinet : identité, formats et apparence
 * par défaut. SMTP (mot de passe compris), gabarits, numérotation et
 * abonnement restent réservés au personnel.
 */
const CLIENT_SETTINGS_FIELDS = [
  'id',
  'code',
  'name',
  'logo_url',
  'brand_color',
  'slogan',
  'address',
  'contact_email',
  'contact_phone',
  'website',
  'app_locale',
  'date_format',
  'currency',
  'currency_symbol',
  'currency_symbol_position',
  'currency_decimals',
  'currency_thousands_sep',
  'currency_decimal_sep',
  'theme_name',
  'font_ui',
  'font_heading',
  'font_mono',
  'default_font_size',
  'default_sidebar_style',
] as const;

function clientSettingsResponse(settings: any): any {
  return Object.fromEntries(
    CLIENT_SETTINGS_FIELDS.filter((field) => field in settings).map((field) => [
      field,
      settings[field],
    ]),
  );
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/settings/app')
export class AppSettingsController {
  constructor(
    private readonly appSettingsService: AppSettingsService,
    private readonly userSettingsService: UserSettingsService,
    private readonly smtpService: SmtpService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @ApiOperation({ summary: 'Récupérer les paramètres du cabinet' })
  async get(@Req() req: Request) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const cabinet = await this.appSettingsService.findByCabinet(cabinetId);
    const settings = serializeCabinet(
      settingsResponse(cabinet, canManageSettings(req)),
    );
    return isClientUser(req.user) ? clientSettingsResponse(settings) : settings;
  }

  @Get('dictionary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mots du dictionnaire du cabinet (correcteur d'orthographe des éditeurs)" })
  async dictionary(@Req() req: Request) {
    if (isClientUser(req.user)) throw new ForbiddenException('Réservé aux membres du cabinet');
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    return { words: await this.appSettingsService.dictionary(cabinetId) };
  }

  /** Tout membre du cabinet peut ajouter un mot (pas de droit « paramètres » requis). */
  @Post('dictionary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ajouter des mots au dictionnaire du cabinet' })
  async addToDictionary(@Req() req: Request, @Body() body: { word?: string; words?: string[] }) {
    if (isClientUser(req.user)) throw new ForbiddenException('Réservé aux membres du cabinet');
    const words = [...(Array.isArray(body?.words) ? body.words : []), ...(body?.word ? [body.word] : [])].slice(0, 100);
    if (!words.length) throw new BadRequestException('Aucun mot à ajouter');
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    return { words: await this.appSettingsService.addDictionaryWords(cabinetId, words) };
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour les paramètres du cabinet' })
  async update(@Req() req: Request, @Body() dto: AppSettingsDto) {
    assertCanManageSettings(req);
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    if (dto.ai_config !== undefined) {
      throw new BadRequestException(
        'La configuration IA est geree par la console plateforme (module Intelligence artificielle)',
      );
    }
    const updated = await this.appSettingsService.update(cabinetId, dto);
    return serializeCabinet(settingsResponse(updated, true));
  }

  @Post('apply-appearance')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Applique l'apparence par défaut du cabinet à tous ses membres",
  })
  async applyAppearance(@Req() req: Request) {
    assertCanManageSettings(req);
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const updated =
      await this.userSettingsService.applyCabinetAppearanceToMembers(cabinetId);
    return { updated };
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Réinitialiser les paramètres du cabinet' })
  async reset(@Req() req: Request) {
    assertCanManageSettings(req);
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const reset = await this.appSettingsService.reset(cabinetId);
    return serializeCabinet(settingsResponse(reset, true));
  }

  @Post('smtp/test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Envoyer un e-mail de test avec le SMTP du cabinet',
  })
  async testSmtp(@Req() req: Request, @Body() body: { to?: string }) {
    assertCanManageSettings(req);
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const to = body?.to || (req.user as any)?.email;
    return this.smtpService.sendTest(cabinetId, to);
  }
}
