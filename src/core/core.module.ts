import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

import { ChatModule } from 'src/modules/chat/chat.module';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { PermissionsService } from 'src/modules/iam/permission/permission.service';
import { RolePermission } from 'src/modules/iam/role-permission/entities/role-permission.entity';
import { RolePermissionService } from 'src/modules/iam/role-permission/role-permission.service';
// import { swaggerConfig } from './config/swagger.config';
import { UserRole } from 'src/modules/iam/user-role/entities/user-role.entity';

import { UserRolesService } from 'src/modules/iam/user-role/user-role.service';

import { User } from 'src/modules/iam/user/entities/user.entity';

import { UsersService } from 'src/modules/iam/user/user.service';

import { MailTemplateModule } from 'src/modules/mail-template/mail-template.module';

import { NotificationModule } from 'src/modules/notification/notification.module';

import { PlansModule } from 'src/modules/plans/plans.module';

import { HttpModule } from '@nestjs/axios';

import { forwardRef, Global, Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';


import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiDatabaseModule } from './ai-database/ai-database.module';
import { AuthTokenService } from './auth/auth-token.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthToken } from './auth/entities/auth-token.entity';
import { PermissionSeeder } from './auth/seeders/permission.seeder';
import { RoleSeeder } from './auth/seeders/role.seeder';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { LocalStrategy } from './auth/strategies/local.strategy';
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { databaseConfig } from './config/database.config';
import { PublicGuard } from './decorators/public.guard';
import { OtpCode, OtpOnlineLink } from './entities/otp-code.entity';
import { InitService } from './init/init.service';
import { CoreNotificationsModule } from './notifications/core-notifications.module';
import { OtpController } from './shared/controlers/otp.controller';
import { EmailsModule } from './shared/emails/emails.module';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { QueryLoggingInterceptor } from './shared/interceptors/query-logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { EmailService } from './shared/services/email/email.service copy';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { McotiService } from './shared/services/mCoti/mcoti.service';
import { OtpService } from './shared/services/otp/otp.service';
import { PaginationService as MyPaginationService, PaginationService } from './shared/services/pagination/pagination.service';
import { PaginationServiceV1 } from './shared/services/pagination/paginations-v1.service';
import { MainGateway } from './shared/services/socket/main.gateway';
import { SocketService } from './shared/services/socket/socket.service';
import { TenantRepositoryPatch } from './tenant/tenant-repository.patch';
import { TenantResolverMiddleware } from './tenant/tenant-resolver.middleware';
import { TenantContext } from './tenant/tenant.context';
import { TenantInterceptor } from './tenant/tenant.interceptor';





























@Global()
@Module({
  imports: [
    // forwardRef(() => IamModule),
    // forwardRef(() => AgenciesModule),
    // forwardRef(() => SavingsAccountModule),
    EmailsModule,
    MailTemplateModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        baseURL: configService.get<string>('ENDPOINT_MCOTI'),
        timeout: 5000,
        maxRedirects: 3,
      }),
      inject: [ConfigService],
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey', // à stocker en variable d’environnement
      signOptions: { expiresIn: '30d' },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => config.get('database')!,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      OtpCode,
      Permission,
      User,
      Branch,
      RolePermission, 
      Employee,
      UserRole,
      Customer,
      OtpOnlineLink,
      AuthToken,
    ]),
    PassportModule,
    ChatModule,
    // forwardRef(() => ChatModule),
    forwardRef(() => NotificationModule) ,// Pour éviter les dépendances circulaires
    // forwardRef(() => NotificationModule),
    // SeedersModule,
    ScheduleModule.forRoot(), AiDatabaseModule, PlansModule,
    CoreNotificationsModule,
  ],
  controllers: [AuthController, OtpController],
  providers: [
    AuthService,
    LocalStrategy,
    PermissionSeeder,
    RoleSeeder,
    JwtStrategy,
    McotiService,
    OtpService,
    UsersService,
    EmployeeService,
    UserRolesService,
    PermissionsService,
    RolePermissionService,// RolesGuard,
    PermissionsGuard,
    PublicGuard,
    { provide: APP_GUARD, useClass: PublicGuard },
    { provide: APP_FILTER, useClass: TypeOrmExceptionFilter },
    { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: QueryLoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    InitService,
    KeyGeneratorService,
    MyPaginationService,
    PaginationService,
    PaginationServiceV1,
    SocketService,
    AuthTokenService,
    EmailService,
    MainGateway,
    TenantContext,
    TenantRepositoryPatch,
    TenantResolverMiddleware,
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    TypeOrmModule
    // { provide: 'APP_PIPE', useClass: ValidationPipe },
  ],
  exports: [
    ConfigModule,
    EmailService,
    EmailsModule,
    MailTemplateModule,
    JwtModule,
    TypeOrmModule,
    JwtModule,
    PassportModule,
    UsersService,
    EmployeeService,
    OtpService,
    AuthService,
    McotiService,
    PermissionSeeder,
    RoleSeeder,
    PermissionsGuard,
    MyPaginationService,
    PaginationService,
    PaginationServiceV1,
    // JwtAuthGuard,
    KeyGeneratorService,
    SocketService,
    MainGateway,
    TenantContext,
    CoreNotificationsModule,
  ],
})
export class CoreModule {}
