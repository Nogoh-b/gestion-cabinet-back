import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { IamModule } from './modules/iam/iam.module';
import { CustomerModule } from './modules/customer/customer.module';
import { GeographyModule } from './modules/geography/geography.module';

@Module({
  imports: [CoreModule, IamModule, CustomerModule, GeographyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
    /*configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*'); // ou seulement les routes protégées
  }*/
}
