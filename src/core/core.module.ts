import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { IamModule } from 'src/modules/iam/iam.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './auth/strategies/local.strategy';
// import { swaggerConfig } from './config/swagger.config';
import { InitService } from './init/init.service';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { PermissionSeeder } from './auth/seeders/permission.seeder';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { SeedersModule } from './database/seeders/seeders.module';
import { EmailService } from './shared/services/email/email.service';

@Global()

@Module({
  imports: [
    IamModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',  // à stocker en variable d’environnement
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
    // { provide: 'APP_GUARD', useClass: RolesGuard },
    { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    InitService,
    KeyGeneratorService,
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
    // RolesGuard,
    JwtAuthGuard,
    KeyGeneratorService
  ],
})
export class CoreModule {}