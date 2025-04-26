import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
// import { swaggerConfig } from './config/swagger.config';

@Module({
  imports: [
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
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    JwtStrategy,
    // { provide: 'APP_GUARD', useClass: JwtAuthGuard },
    // { provide: 'APP_GUARD', useClass: RolesGuard },
    // { provide: 'APP_INTERCEPTOR', useClass: LoggingInterceptor },
    // { provide: 'APP_INTERCEPTOR', useClass: TransformInterceptor },
    // { provide: 'APP_PIPE', useClass: ValidationPipe },
  ],
  exports: [
    ConfigModule,
    JwtModule,
    TypeOrmModule,
  ],
})
export class CoreModule {}