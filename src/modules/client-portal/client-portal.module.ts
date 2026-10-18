import { CoreNotificationsModule } from 'src/core/notifications/core-notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { DocumentCategory } from '../document-category/entities/document-category.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentsModule } from '../documents/documents.module';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Facture } from '../facture/entities/facture.entity';
import { User } from '../iam/user/entities/user.entity';
import { Paiement } from '../paiement/entities/paiement.entity';

import { ClientAccessStaffController } from './client-access.staff.controller';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { ClientMessage } from './entities/client-message.entity';
import { ClientMessageSubscriber } from './subscribers/client-message.subscriber';

/** Espace client : documents, factures/paiements, messagerie, accès. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientMessage,
      Cabinet,
      Customer,
      DocumentCategory,
      DocumentCustomer,
      Dossier,
      Facture,
      Paiement,
      User,
    ]),
    forwardRef(() => DocumentsModule),
    CoreNotificationsModule,
  ],
  controllers: [ClientPortalController, ClientAccessStaffController],
  providers: [ClientPortalService, ClientMessageSubscriber],
})
export class ClientPortalModule {}
