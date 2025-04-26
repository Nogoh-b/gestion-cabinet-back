import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { IamModule } from './modules/iam/iam.module';

@Module({
  imports: [CoreModule, IamModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
