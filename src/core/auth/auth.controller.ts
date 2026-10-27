import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger'; // Ajouter
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
import {
  clearPasswordResetCookie,
  clearSessionCookies,
  PASSWORD_RESET_COOKIE,
  readCookie,
  setPasswordResetCookie,
  setSessionCookies,
} from './session-cookie.util';

@ApiTags('Authentication')
@Controller('auth')
@ApiBearerAuth()
@ApiSecurity('x-tenant-code') // ajoute le header tenant à TOUTES les routes auth (login inclus)
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Authentification utilisateur' })
  @ApiBody({ 
    type: LoginUserDto,
    description: 'Credentials utilisateur' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Connexion réussie',
    type: LoginResponseDto
  })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentatives / minute
  async login(
    @Request() req,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(req.user);
    return this.attachSession(response, result);
  }

  /** 2e étape MFA : vérifie l'OTP de connexion et émet le token. */
  @Public()
  @Post('verify-mfa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 vérifications / minute
  @ApiOperation({ summary: 'Vérifier le code de connexion (MFA)' })
  async verifyMfa(
    @Body() body: { email: string; otp: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyMfa(body?.email, body?.otp);
    return this.attachSession(response, result);
  }

  /** Active la double authentification pour le compte courant. */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer la double authentification (OTP e-mail)' })
  async enableMfa(@Request() req) {
    return this.authService.setMfa(req.user.userId ?? req.user.id, true);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable/challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander le code de confirmation MFA' })
  async requestMfaDisable(@Request() req) {
    return this.authService.requestMfaDisable(
      req.user.userId ?? req.user.id,
    );
  }

  /** Désactive la double authentification pour le compte courant. */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la double authentification' })
  async disableMfa(
    @Request() req,
    @Body() body: { otp: string },
  ) {
    return this.authService.disableMfa(
      req.user.userId ?? req.user.id,
      body?.otp,
    );
  }

  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Get('profile')
  @ApiBearerAuth('access_token')
  async getProfile(@Request() req) {
    // req.user.sub est undefined ici : JwtStrategy remmappe payload.sub → id/userId.
    // On utilise req.user.userId (= employee ID) pour relire les permissions en DB.
    const userId   = req.user.userId ?? req.user.id;
    const roleCode = req.user.role ?? null; // issu du JWT — évite un SELECT user inutile
    const fresh = await this.authService.getFreshProfile(userId, roleCode);
    return { ...req.user, ...fresh };
  }

  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Get('me/permissions')
  @ApiOperation({ summary: 'Récupérer les permissions de l\'utilisateur connecté' })
  async getMyPermissions(@Request() req) {
    const userId   = req.user.userId ?? req.user.id;
    const roleCode = req.user.role ?? null;
    const fresh = await this.authService.getFreshProfile(userId, roleCode);
    return { permissions: fresh.permissions };
  }
  
  @Public()
  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const principal = (req as any).user;
    const tokens = await this.authService.refreshTokens(
      Number(principal.sub),
      principal.refreshToken,
      Number(principal.tenantId),
    );
    setSessionCookies(response, tokens);
    return { authenticated: true };
  }

  @UseGuards(JwtAuthGuard)
  @AllowClient()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const principal = (req as any).user;
    await this.authService.logout(principal.userId ?? principal.id);
    clearSessionCookies(response);
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
  async verifyOTP(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyOTP(verifyOtpDto);
    if (!result.token) return result;
    setPasswordResetCookie(response, result.token);
    const { token: _token, ...body } = result;
    return body;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 réinitialisations / minute
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  async resetPassword(
    @Req() request: ExpressRequest,
    @Body() resetPasswordDto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token =
      readCookie(request, PASSWORD_RESET_COOKIE) ??
      resetPasswordDto.token;
    if (!token) {
      throw new BadRequestException(
        'Session de réinitialisation absente ou expirée',
      );
    }
    const result = await this.authService.resetPassword({
      ...resetPasswordDto,
      token,
    });
    clearPasswordResetCookie(response);
    return this.attachSession(response, result);
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
  async setPassword(
    @Body() setPasswordDto: SetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.setPassword(setPasswordDto);
    return this.attachSession(response, result);
  }

  private attachSession(response: Response, result: any) {
    if (!result?.access_token || !result?.refresh_token) {
      return result;
    }
    setSessionCookies(response, {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    });
    const {
      refresh_token: _refreshToken,
      access_token: _accessToken,
      ...body
    } = result;
    return { ...body, authenticated: true };
  }
}
