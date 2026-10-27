import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/core/decorators/public.decorator';
import { PlatformAuthService } from './platform-auth.service';
import {
  PlatformChangePasswordDto,
  PlatformForgotPasswordDto,
  PlatformLoginDto,
  PlatformSetPasswordDto,
  PlatformVerifyOtpDto,
} from './dto/platform-auth.dto';
import { PlatformRoute, platformValidationPipe } from './platform-route.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
  requestIp,
} from '../common/platform-principal';

function metaOf(req: any) {
  return {
    ip: requestIp(req),
    userAgent: String(req?.headers?.['user-agent'] ?? '').slice(0, 255) || null,
  };
}

/** Connexion à l'espace plateforme (routes publiques, limitées en débit). */
@ApiTags('Plateforme — Authentification')
@Controller('platform/auth')
@UsePipes(platformValidationPipe())
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Étape 1 : email + mot de passe → code OTP par email' })
  login(@Body() dto: PlatformLoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, metaOf(req));
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Étape 2 : code OTP → jeton plateforme' })
  verifyOtp(@Body() dto: PlatformVerifyOtpDto, @Req() req: any) {
    return this.auth.verifyOtp(dto.challenge, dto.code, metaOf(req));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Envoyer un lien de réinitialisation' })
  forgotPassword(@Body() dto: PlatformForgotPasswordDto, @Req() req: any) {
    return this.auth.forgotPassword(dto.email, metaOf(req));
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Définir le mot de passe (invitation ou réinitialisation)' })
  setPassword(@Body() dto: PlatformSetPasswordDto, @Req() req: any) {
    return this.auth.setPassword(dto.token, dto.password, metaOf(req));
  }

  @PlatformRoute()
  @Get('me')
  @ApiOperation({ summary: 'Admin plateforme connecté' })
  me(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.auth.me(admin);
  }

  @PlatformRoute()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion (révoque tous les jetons de ce compte)' })
  logout(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.auth.logout(admin);
  }

  @PlatformRoute()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer son mot de passe' })
  changePassword(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body() dto: PlatformChangePasswordDto,
  ) {
    return this.auth.changePassword(admin, dto.current_password, dto.new_password);
  }
}
