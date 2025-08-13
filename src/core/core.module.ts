/* eslint-disable prettier/prettier */
import { AgenciesModule } from 'src/modules/agencies/agencies.module';
import { IamModule } from 'src/modules/iam/iam.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';






import { TypeOrmModule } from '@nestjs/typeorm';





import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionSeeder } from './auth/seeders/permission.seeder';
// import { swaggerConfig } from './config/swagger.config';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { LocalStrategy } from './auth/strategies/local.strategy';
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { databaseConfig } from './config/database.config';
import { SeedersModule } from './database/seeders/seeders.module';
import { OtpCode, OtpOnlineLink } from './entities/otp-code.entity';
import { InitService } from './init/init.service';
import { OtpController } from './shared/controlers/otp.controller';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { EmailService } from './shared/services/email/email.service';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { McotiService } from './shared/services/mCoti/mcoti.service';
import { OtpService } from './shared/services/otp/otp.service';
import { PaginationService } from './shared/services/pagination/pagination.service';






@Global()
@Module({
  imports: [
    forwardRef(() => IamModule),
    forwardRef(() => AgenciesModule),
    // forwardRef(() => SavingsAccountModule),
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
      OtpOnlineLink,
    ]),
    PassportModule,
    SeedersModule,
  ],
  controllers: [AuthController, OtpController],
  providers: [
    AuthService,
    LocalStrategy,
    PermissionSeeder,
    JwtStrategy,
    McotiService,
    OtpService,
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
    OtpService,
    AuthService,
    McotiService,
    PermissionSeeder,
    PermissionsGuard,
    PaginationService,
    JwtAuthGuard,
    KeyGeneratorService,
  ],
})
export class CoreModule {}
