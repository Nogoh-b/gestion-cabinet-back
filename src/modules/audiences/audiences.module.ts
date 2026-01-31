import { CoreModule } from 'src/core/core.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';



import { AudienceTypeModule } from '../audience-type/audience-type.module';
import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';
import { Audience } from './entities/audience.entity';




@Module({
  imports: [
    TypeOrmModule.forFeature([Audience]),
    CustomerModule,
    AudienceTypeModule,
    DossiersModule,
    DocumentsModule,
    CoreModule
  ],
  controllers: [AudiencesController],
  providers: [AudiencesService],
})
export class AudiencesModule {}
