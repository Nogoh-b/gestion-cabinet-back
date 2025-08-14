import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';
import { Controller, Get, Post, Body, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';



import { ResetPasswordRequestDto } from './dto/create-employee.dto';
import { EmployeeService } from './employee.service';




@Controller('user')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 

export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @ApiOperation({ summary: 'Create new employee' })
  @RequirePermissions('CREATE_EMPLOYEE')
  createEmployee(@Body() dto: CreateUserDto) {
    return this.employeeService.createEmployee(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @RequirePermissions('VIEW_EMPLOYEE')
  findAllEmployees() {
    return this.employeeService.findAllEmployees();
  }
  @Post('send-new-password')
  async sendNewPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.employeeService.send_new_password({
      id: dto.id
    });
  }

  /**
   * Variante: réinitialisation par id directement dans l'URL.
   */
  @Post(':id/send-new-password')
  async sendNewPasswordById(@Param('id', ParseIntPipe) id: number) {
    return this.employeeService.send_new_password({ id });
  }
    /*@Get(':id')
    @ApiOperation({ summary: 'Récupérer un utilisateur avec son role' })
    @RequirePermissions('VIEW_EMPLOYEE')
    findOne(@Param('id') id: string): Promise<any> {
      return this.employeeService.findOne(+id);
    }
  
    @Post(':id/desable')
    @ApiOperation({ summary: 'Supression d\'un utilisateur' })
    @RequirePermissions('EDIT_EMPLOYEE')
    remove(@Param('id') id: string): Promise<any> {
      return this.employeeService.descativeUser(+id);
    }
  
    @Post(':id/enable')
    @ApiOperation({ summary: 'Supression d\'un utilisateur' })
    @RequirePermissions('DELETE_EMPLOYEE')
    add(@Param('id') id: string): Promise<any> {
      return this.employeeService.descativeUser(+id);
    }*/
}
