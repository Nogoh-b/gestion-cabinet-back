import { Controller, Post, UseGuards, HttpCode, Req, HttpStatus, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger'; // Ajouter
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Public } from '../decorators/public.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
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
  /*@ApiResponse({ status: 401, description: 'Non autorisé' })
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }*/

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Public()
  @UseGuards(AuthGuard('refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Req() req: Request) {
    // return this.authService.refreshTokens(req.user.sub, req.user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request) {
    // await this.authService.logout(req.user.sub);
  }
}