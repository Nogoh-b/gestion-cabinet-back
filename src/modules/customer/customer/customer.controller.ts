import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginationQueryCustomerDto } from 'src/core/shared/dto/pagination-query.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
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
  ParseIntPipe
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { CustomersService } from './customer.service';
import { CreateCustomerFromCotiDto } from './dto/create-customer-from-coti.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerCommunicationDto } from './dto/create-customer-communication.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { CustomerSearchDto } from './dto/search-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { EmailService } from 'src/core/shared/services/email/email.service copy';
import { CustomerStatsService } from './customer-stats.service';


@ApiTags('customer')
@Controller('customer')
@ApiBearerAuth() 

export class CustomerController {
  constructor(
    private readonly customerService: CustomersService,
    private readonly emailService: EmailService,
    private readonly statsService: CustomerStatsService
  ) {}


  @Get('stats')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: 'Obtenir les statistiques des clients' })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: number,
  ): Promise<any> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      branchId: branchId ? +branchId : undefined,
    });
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un client spécifique' })
  @ApiParam({ name: 'id', description: 'ID du client' })
  async getStatsForCustomer(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.statsService.getStats({ customerId: id });
  }

  @Get('stats/top')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('view_clients')
  async getTopClients() {
    const stats = await this.statsService.getStats({});
    return (stats as any).topClients;
  }

  @Get('stats/without-dossier')
  // @Roles(UserRole.ADMIN)
  @RequirePermissions('view_clients')
  async getCustomersWithoutDossier() {
    const stats = await this.statsService.getStats({});
    return (stats as any).customersWithoutDossier;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully', type: CustomerResponseDto })
  @RequirePermissions('create_client')
  async create(@Body() createCustomerDto: CreateCustomerDto): Promise<any> {
    console.log(createCustomerDto)
    return await this.customerService.create(createCustomerDto);
  }

  @Get('/search')
  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: 'Rechercher customer' })
  @ApiResponse({ status: 201, description: 'Liste' , type: [CustomerResponseDto] })

 async search(

    @Query() searchParams?: CustomerSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.customerService.searchWithTransformer(searchParams as SearchCriteria, CustomerResponseDto , paginationParams);
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
  @RequirePermissions('view_clients')
  async findAll(): Promise<CustomerResponseDto[]> {
    return await this.customerService.findAll();
  }


  @Get("v2")
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200, description: 'List of customers', type: [CustomerResponseDto] })
  @RequirePermissions('view_clients')
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
  // @RequirePermissions('view_clients')
  async findOne(@Param('id') id: string): Promise<CustomerResponseDto> {
    return await this.customerService.findOne(+id);
  }

  @Get(':customer_code/documents')
  @ApiOperation({ summary: 'Get a customer by customer_code' })
  @ApiResponse({ status: 200, description: 'Customer found', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  // @RequirePermissions('view_clients')
  async findOneDocs(@Param('customer_code') customer_code: string): Promise<CustomerResponseDto> {
    return await this.customerService.findDocumentsOne(customer_code);
  }

  @Get(':id/stats-savings-accounts')
  @ApiOperation({ summary: 'Get a customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  // @RequirePermissions('view_clients')
  async findOneStats(@Param('id') id: string): Promise<CustomerResponseDto> {
    return await this.customerService.findOneStats(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Update a customer' })
  @ApiResponse({ status: 200, description: 'Customer updated', type: CustomerResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @RequirePermissions('edit_client')
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
  @RequirePermissions('delete_client')
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

  // ==================== COMMUNICATIONS CLIENT ====================

  @Get(':id/communications')
  @RequirePermissions('view_clients')
  @ApiOperation({ summary: "Liste des communications d'un client" })
  @ApiParam({ name: 'id', description: 'ID du client' })
  async getCommunications(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.getCommunications(id);
  }

  @Post(':id/communications')
  @RequirePermissions('edit_client')
  @ApiOperation({ summary: 'Ajouter une communication à un client' })
  @ApiParam({ name: 'id', description: 'ID du client' })
  @ApiBody({ type: CreateCustomerCommunicationDto })
  async addCommunication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCustomerCommunicationDto,
  ) {
    return this.customerService.addCommunication(id, dto);
  }

  @Delete(':id/communications/:communicationId')
  @RequirePermissions('edit_client')
  @ApiOperation({ summary: "Supprimer une communication d'un client" })
  @ApiParam({ name: 'id', description: 'ID du client' })
  @ApiParam({ name: 'communicationId', description: 'ID de la communication' })
  async removeCommunication(
    @Param('id', ParseIntPipe) id: number,
    @Param('communicationId', ParseIntPipe) communicationId: number,
  ) {
    return this.customerService.removeCommunication(id, communicationId);
  }
}