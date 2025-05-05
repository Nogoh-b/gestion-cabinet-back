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
      signOptions: { expiresIn: '1h' },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => config.get('database')!,
      inject: [ConfigService],
    }),
    PassportModule,

  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    // RolesGuard,
    JwtAuthGuard,
    // { provide: 'APP_GUARD', useClass: JwtAuthGuard },
    // { provide: 'APP_GUARD', useClass: RolesGuard },
    { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    InitService,
    KeyGeneratorService,
    // { provide: 'APP_PIPE', useClass: ValidationPipe },
  ],
  exports: [
    ConfigModule,
    JwtModule,
    TypeOrmModule,
    JwtModule,
    PassportModule,
    AuthService,
    // RolesGuard,
    JwtAuthGuard,
    KeyGeneratorService
  ],
})
export class CoreModule {}