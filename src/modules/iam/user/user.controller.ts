// users.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Post, Body, Get, Param, UseGuards, ParseIntPipe, Controller } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth, ApiTags } from '@nestjs/swagger';


import { CreateUserDto, ResetPasswordRequestDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UsersService } from './user.service';



@ApiTags('Users1')
@Controller('users1')

@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Creation d\'un nouvel utilisateur' })
  @ApiResponse({ status: 201, description: 'User created', type: User })
  @RequirePermissions('CREATE_EMPLOYEE')
    create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Récuperer les utilisateurs avec leurs roles' })
  @RequirePermissions('VIEW_EMPLOYEE')
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un utilisateur avec son role' })
  @RequirePermissions('VIEW_EMPLOYEE')
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(+id);
  }

  @Post(':id/desable')
  @ApiOperation({ summary: 'Supression d\'un utilisateur' })
  @RequirePermissions('EDIT_EMPLOYEE')
  remove(@Param('id') id: string): Promise<User> {
    return this.usersService.descativeUser(+id);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Supression d\'un utilisateur' })
  @RequirePermissions('DELETE_EMPLOYEE')
  add(@Param('id') id: string): Promise<User> {
    return this.usersService.descativeUser(+id);
  }


    /**
   * Envoie un mot de passe temporaire à l'utilisateur (identification par email ou id dans le body).
   * - Variables en snake_case dans le DTO
   * - Commentaires en français
   */
  @Post('send-new-password')
  async sendNewPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.usersService.send_new_password({
      id: dto.id
    });
  }

  /**
   * Variante: réinitialisation par id directement dans l'URL.
   */
  @Post(':id/send-new-password')
  async sendNewPasswordById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.send_new_password({ id });
  }
}