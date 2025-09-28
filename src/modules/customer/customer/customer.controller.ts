import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { AdvancedSearchOptionsDto } from 'src/core/shared/dto/advanced-search.dto';
import { EmailService } from 'src/core/shared/services/email/email.service';
import { KycSyncDto } from 'src/modules/documents/document-customer/dto/create-document-from-coti.dto';
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
  Query,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';






import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth, ApiBody } from '@nestjs/swagger';






import { CustomersService } from './customer.service';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationQueryCustomerDto } from 'src/core/shared/dto/pagination-query.dto';












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

  @Get("v2")
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200, description: 'List of customers', type: [CustomerResponseDto] })
  @RequirePermissions('VIEW_CUSTOMER')
  async findAllV1( @Query() query: PaginationQueryCustomerDto): Promise<any> {
    const { page, limit, term, fields, exact, from, to, type_code } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return await this.customerService.findAllV2(      
      +page, 
      +limit,       
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,);
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

  @Post('sync-kyc')
  @ApiOperation({ summary: 'Réceptionne les codes clients à synchroniser' })
  @ApiBody({ type: KycSyncDto })
  async sync( @Body() dto: KycSyncDto) {
    // traite comme tu veux dans le service
    return this.customerService.sync(dto); 
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
  @Get('kyc/checkEmail')
  async getCustomersWithMissingKyc1(@Query('email') email: string) {
    return  await this.customerService.emailExists(email)
  }
  @Get('kyc/missing')
  async getCustomersWithMissingKyc() {
    return this.customerService.findCustomersWithMissingKyc();
  }
}