import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { AdvancedSearchOptionsDto } from 'src/core/shared/dto/advanced-search.dto';
import { EmailService } from 'src/core/shared/services/email/email.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';






import { CustomersService } from './customer.service';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';






@ApiTags('customer')
@Controller('customer')
@ApiBearerAuth() 

export class CustomerController {
  constructor(
    private readonly customerService: CustomersService,
    private readonly emailService: EmailService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully', type: CustomerResponseDto })
  @RequirePermissions('CREATE_CUSTOMER')
  async create(@Body() createCustomerDto: CreateCustomerDto): Promise<any> {
    return await this.customerService.create(createCustomerDto);
  }

  @Post('/search')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VIEW_CUSTOMER')
  @ApiOperation({ summary: 'Rechercher customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully', type: CustomerResponseDto })

  async search(
    @Body() searchDto: AdvancedSearchOptionsDto,
    ): Promise<any[]> {
    
     return await this.customerService.search(searchDto);
  }


  @Post('/create-online')
  @ApiOperation({ summary: 'Create a new customer' })
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Customer created successfully', type: CustomerResponseDto })

  async createUserFromeCoti(
    @Body() createCustomerDto: CreateCustomerFromCotiDto,
    @UploadedFiles() files: Express.Multer.File[]
    ): Promise<any> {
    
     return await this.customerService.createFromCoti(createCustomerDto, files);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200, description: 'List of customers', type: [CustomerResponseDto] })
  @RequirePermissions('VIEW_CUSTOMER')
  async findAll(): Promise<CustomerResponseDto[]> {
    return await this.customerService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  // @RequirePermissions('VIEW_CUSTOMER')
  async findOne(@Param('id') id: string): Promise<CustomerResponseDto> {
    return await this.customerService.findOne(+id);
  }

  @Get(':customer_code/documents')
  @ApiOperation({ summary: 'Get a customer by customer_code' })
  @ApiResponse({ status: 200, description: 'Customer found', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  // @RequirePermissions('VIEW_CUSTOMER')
  async findOneDocs(@Param('customer_code') customer_code: string): Promise<CustomerResponseDto> {
    return await this.customerService.findDocumentsOne(customer_code);
  }

  @Get(':id/stats-savings-accounts')
  @ApiOperation({ summary: 'Get a customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  // @RequirePermissions('VIEW_CUSTOMER')
  async findOneStats(@Param('id') id: string): Promise<CustomerResponseDto> {
    return await this.customerService.findOneStats(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Update a customer' })
  @ApiResponse({ status: 200, description: 'Customer updated', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @RequirePermissions('EDIT_CUSTOMER')
  async update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return await this.customerService.update(+id, updateCustomerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Delete a customer' })
  @ApiResponse({ status: 204, description: 'Customer deleted' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @RequirePermissions('DELETE_CUSTOMER')
  async remove(@Param('id') id: string): Promise<void> {
    return await this.customerService.remove(+id);
  }

  @Post('contact')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  async contactForm(@Body() contactDto: any) {
    return await this.emailService.sendMail({
      to: 'nogohbrice@gmail.com',
      subject: 'Nouveau message de contact',
      message: 'contact-form',
      context: {
        name: 'contactDto.name',
        message: 'contactDto.message'
      }
    });
}
}