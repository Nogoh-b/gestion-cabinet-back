import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from 'src/core/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingDto } from './onboarding.dto';
import { setSessionCookies } from 'src/core/auth/session-cookie.util';

/**
 * Toutes les routes de ce controller sont publiques (pas d'authentification).
 * @Public() sur la classe garantit que PublicGuard retourne true
 * pour TOUTES les méthodes, même si un JwtAuthGuard local est ajouté plus tard.
 */
@ApiTags('Onboarding')
@Controller('onboarding')
@Public()   // ← classe entière publique
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  /**
   * Création d'un nouveau cabinet en mode trial.
   * Route publique — accessible sans authentification.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un nouveau cabinet (plan trial)' })
  async register(
    @Body() dto: OnboardingDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.register(dto);
    if (result?.access_token && result?.refresh_token) {
      setSessionCookies(response, {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
      });
    }
    const {
      access_token: _accessToken,
      refresh_token: _refreshToken,
      ...body
    } = result;
    return body;
  }

  /**
   * Liste publique des plans actifs pour l'écran d'inscription.
   * Route publique — accessible sans authentification (contrairement à
   * GET /plans/active qui exige un token).
   */
  @Get('plans')
  @ApiOperation({ summary: 'Plans actifs proposés à l\'inscription (public)' })
  listPlans() {
    return this.service.listActivePlans();
  }
}
