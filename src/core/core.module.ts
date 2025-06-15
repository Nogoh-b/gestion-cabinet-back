/* eslint-disable prettier/prettier */
import { IamModule } from 'src/modules/iam/iam.module';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';


import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionSeeder } from './auth/seeders/permission.seeder';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { LocalStrategy } from './auth/strategies/local.strategy';
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter';
// import { swaggerConfig } from './config/swagger.config';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { databaseConfig } from './config/database.config';
import { SeedersModule } from './database/seeders/seeders.module';
import { InitService } from './init/init.service';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { EmailService } from './shared/services/email/email.service';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { PaginationService } from './shared/services/pagination/pagination.service';



@Global()
@Module({
  imports: [
    IamModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
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
    PassportModule,
    SeedersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    PermissionSeeder,
    JwtStrategy,
    // RolesGuard,
    PermissionsGuard,
    JwtAuthGuard,
    // { provide: 'APP_GUARD', useClass: JwtAuthGuard },
    { provide: APP_FILTER,     useClass: TypeOrmExceptionFilter },
    { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    InitService,
    KeyGeneratorService,
    PaginationService,
    EmailService,
    // { provide: 'APP_PIPE', useClass: ValidationPipe },
  ],
  exports: [
    ConfigModule,
    EmailService,
    JwtModule,
    TypeOrmModule,
    JwtModule,
    PassportModule,
    AuthService,
    PermissionSeeder,
    PermissionsGuard,
    PaginationService,
    JwtAuthGuard,
    KeyGeneratorService,
  ],
})
export class CoreModule {}
