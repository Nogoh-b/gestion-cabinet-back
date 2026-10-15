import {
  Controller,
  Post,
  UseGuards,
  HttpCode,
  Req,
  HttpStatus,
  Request,
  Get,
  Body,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger'; // Ajouter
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Public } from '../decorators/public.decorator';
import { AllowClient } from '../decorators/allow-client.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SetPasswordDto } from './dto/set-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Authentication')
@Controller('auth')
@ApiBearerAuth()
@ApiSecurity('x-tenant-code') // ajoute le header tenant à TOUTES les routes auth (login inclus)
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: 'Authentification utilisateur' })
  @ApiBody({
    type: LoginUserDto,
    description: 'Credentials utilisateur',
  })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie',
    type: LoginResponseDto,
  })
  /*@ApiResponse({ status: 401, description: 'Non autorisé' })
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }*/
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentatives / minute
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  /** 2e étape MFA : vérifie l'OTP de connexion et émet le token. */
  @Public()
  @Post('verify-mfa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 vérifications / minute
  @ApiOperation({ summary: 'Vérifier le code de connexion (MFA)' })
  async verifyMfa(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyMfa(body?.email, body?.otp);
  }

  /** Active la double authentification pour le compte courant. */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer la double authentification (OTP e-mail)' })
  async enableMfa(@Request() req) {
    return this.authService.setMfa(req.user.userId ?? req.user.id, true);
  }

  /** Désactive la double authentification pour le compte courant. */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la double authentification' })
  async disableMfa(@Request() req) {
    return this.authService.setMfa(req.user.userId ?? req.user.id, false);
  }

  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Get('profile')
  @ApiBearerAuth('access_token')
  async getProfile(@Request() req) {
    // req.user.sub est undefined ici : JwtStrategy remmappe payload.sub → id/userId.
    // On utilise req.user.userId (= employee ID) pour relire les permissions en DB.
    const userId = req.user.userId ?? req.user.id;
    const roleCode = req.user.role ?? null; // issu du JWT — évite un SELECT user inutile
    const fresh = await this.authService.getFreshProfile(userId, roleCode);
    return { ...req.user, ...fresh };
  }

  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Get('me/permissions')
  @ApiOperation({
    summary: "Récupérer les permissions de l'utilisateur connecté",
  })
  async getMyPermissions(@Request() req) {
    const userId = req.user.userId ?? req.user.id;
    const roleCode = req.user.role ?? null;
    const fresh = await this.authService.getFreshProfile(userId, roleCode);
    return { permissions: fresh.permissions };
  }

  @Public()
  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Req() req: Request) {
    // return this.authService.refreshTokens(req.user.sub, req.user.refreshToken);
  }

  @AllowClient()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request) {
    // await this.authService.logout(req.user.sub);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 demandes / minute
  @ApiOperation({ summary: 'Demander la réinitialisation du mot de passe' })
  @ApiResponse({ status: 200, description: 'Email envoyé avec succès' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 vérifications / minute
  @ApiOperation({ summary: 'Vérifier le code OTP' })
  @ApiResponse({ status: 200, description: 'Code vérifié avec succès' })
  async verifyOTP(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOTP(verifyOtpDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 réinitialisations / minute
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /** Changement de mot de passe de l'utilisateur connecté (ancien mot de passe requis). */
  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentatives / minute
  @ApiOperation({ summary: 'Changer son mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe modifié' })
  @ApiResponse({
    status: 400,
    description: 'Mot de passe actuel incorrect ou nouveau mot de passe invalide',
  })
  async changePassword(
    @Request() req,
    // Aucune ValidationPipe globale : on valide le DTO ici.
    @Body(new ValidationPipe({ whitelist: true }))
    changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.userId ?? req.user.id,
      req.user.tenantId,
      changePasswordDto.current_password,
      changePasswordDto.new_password,
    );
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 créations / minute
  @ApiOperation({ summary: 'Créer le mot de passe (invitation)' })
  @ApiResponse({ status: 200, description: 'Mot de passe créé' })
  async setPassword(@Body() setPasswordDto: SetPasswordDto) {
    return this.authService.setPassword(setPasswordDto);
  }
}
