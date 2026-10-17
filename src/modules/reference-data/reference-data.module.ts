import { ReferenceGroupSubscriber } from './reference-group.subscriber';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferenceRegistry, REFERENCE_KINDS } from './reference-registry';
import { REFERENCE_ENTITIES } from './entities/reference-data.entity';
import { ReferenceBootstrap } from './reference-bootstrap';
import { ReferenceAdapter } from './reference-adapter';
import { ReferenceDataService } from './reference-data.service';
import { ReferenceDeploymentWorker } from './reference-deployment.worker';
import { ReferenceEffectiveController } from './reference-effective.controller';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { TenantContext } from 'src/core/tenant/tenant.context';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...REFERENCE_ENTITIES,
      ...REFERENCE_KINDS.map((k) => k[3]).filter(
        (v): v is NonNullable<typeof v> => !!v,
      ),
      Cabinet,
    ]),
  ],
  providers: [
    ReferenceRegistry,
    ReferenceBootstrap,
    ReferenceAdapter,
    ReferenceDataService,
    ReferenceDeploymentWorker,
    TenantContext,
    ReferenceGroupSubscriber,
  ],
  controllers: [ReferenceEffectiveController],
  exports: [ReferenceDataService, ReferenceRegistry, ReferenceAdapter],
})
export class ReferenceDataModule {}
