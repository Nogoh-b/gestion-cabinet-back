import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@Controller('employee')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 

export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @ApiOperation({ summary: 'Create new employee' })
  @RequirePermissions('CREATE_EMPLOYEE')
  createEmployee(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.createEmployee(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @RequirePermissions('VIEW_EMPLOYEE')
  findAllEmployees() {
    return this.employeeService.findAllEmployees();
  }
}
