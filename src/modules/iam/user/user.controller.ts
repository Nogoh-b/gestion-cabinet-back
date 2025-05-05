// users.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './user.service';
import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Creation d\'un nouvel utilisateur' })
  @ApiResponse({ status: 201, description: 'User created', type: User })
  create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Récuperer les utilisateurs avec leurs roles' })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un utilisateur avec son role' })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(+id);
  }

  @Post(':id/desable')
  @ApiOperation({ summary: 'Supression d\'un utilisateur' })
  remove(@Param('id') id: string): Promise<User> {
    return this.usersService.descativeUser(+id);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Supression d\'un utilisateur' })
  add(@Param('id') id: string): Promise<User> {
    return this.usersService.descativeUser(+id);
  }
}