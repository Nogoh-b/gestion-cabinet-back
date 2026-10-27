import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ReferenceDataService } from '../reference-data/reference-data.service';

/** Compatibility entrypoint. Published reference profiles own all tenant defaults. */
@Injectable()
export class TenantSeederService {
  constructor(private readonly references: ReferenceDataService) {}
  seedForNewCabinet(
    cabinetId: number,
    profileId?: string,
    manager?: EntityManager,
  ) {
    return this.references.initializeCabinet(cabinetId, profileId, manager);
  }
  async syncIamReferenceDataForAllTenants(): Promise<void> {
    // Intentionally read-only: a restart must never restore removed permissions.
    await this.references.ensureStandard();
  }
  async syncReferenceDataForAllTenants(): Promise<void> {
    throw new Error(
      'Utilisez Plateforme > Référentiels > Comparer et appliquer pour sélectionner les cabinets.',
    );
  }
  async backfillIamDefaultsForAllTenants(): Promise<void> {
    throw new Error(
      'Utilisez Plateforme > Référentiels > Rôles et permissions pour préparer une application explicite.',
    );
  }
}
