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
import { RolesGuard } from './auth/guards/roles.guard';
import { LocalStrategy } from './auth/strategies/local.strategy';
import { jwtConstants } from './auth/config/jwt.config';
// import { swaggerConfig } from './config/swagger.config';

@Global()

@Module({
  imports: [
    IamModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => config.get('database')!,
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        secret: jwtConstants.secret,
        signOptions: { expiresIn: jwtConstants.expiresIn }
      }),
      inject: [ConfigService]
    }),
    PassportModule,

  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    AuthService,
    LocalStrategy,
    JwtStrategy,
    RolesGuard,
    JwtAuthGuard,
    // { provide: 'APP_GUARD', useClass: JwtAuthGuard },
    { provide: 'APP_GUARD', useClass: RolesGuard },
    { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    // { provide: 'APP_PIPE', useClass: ValidationPipe },
    AuthService
  ],
  exports: [
    ConfigModule,
    JwtModule,
    TypeOrmModule,
    JwtModule,
    PassportModule,
    AuthService,
    RolesGuard,
    JwtAuthGuard
  ],
})
export class CoreModule {}