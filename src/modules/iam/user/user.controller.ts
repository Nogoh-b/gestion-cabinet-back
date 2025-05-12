// users.controller.ts
import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './user.service';
import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('Users')
@Controller('users')

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
}