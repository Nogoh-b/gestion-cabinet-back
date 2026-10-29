import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { SidebarController } from './sidebar.controller';
import { SidebarCountsCache } from './sidebar-counts.cache';
import { SidebarCountsService } from './sidebar-counts.service';

/** Compteurs légers des badges de la sidebar (activés par cabinet). */
@Module({
  imports: [TypeOrmModule.forFeature([Dossier, Audience, Facture, DocumentCustomer])],
  controllers: [SidebarController],
  providers: [SidebarCountsService, SidebarCountsCache],
})
export class SidebarModule {}
