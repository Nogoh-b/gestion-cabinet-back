import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from 'src/core/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingDto } from './onboarding.dto';

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
  register(@Body() dto: OnboardingDto) {
    return this.service.register(dto);
  }
}
