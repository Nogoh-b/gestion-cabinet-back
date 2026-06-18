import { BaseEntitySubscriber } from 'src/core/subscribers/base-entity.subscriber';
import { DataSource, InsertEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';


import { Cabinet } from '../entities/cabinet.entity';
import { TenantSeederService } from '../tenant-seeder.service';


/**
 * CabinetSubscriber
 *
 * Déclenche automatiquement le seed des données de référence
 * (types d'audience, juridictions, templates mail/PDF, etc.)
 * après la création d'un nouveau cabinet en base.
 *
 * Ce subscriber pallie le fait que l'OnboardingService crée le
 * cabinet via le Repository (`this.cabinetRepo.save()`) et non
 * via `CabinetService.create()`, qui seule appelait jusqu'ici
 * `TenantSeederService.seedForNewCabinet()`.
 *
 * Désormais, TOUTE création de cabinet (onboarding, API, seed
 * script, etc.) déclenche automatiquement le seeding.
 */
@Injectable()
export class CabinetSubscriber extends BaseEntitySubscriber<Cabinet> {
  constructor(
    dataSource: DataSource,
    private readonly tenantSeeder: TenantSeederService,
  ) {
    super(dataSource);
  }

  listenTo() {
    return Cabinet;
  }

  /**
   * Après insertion d'un cabinet, lance le seeding des données de
   * référence dans le contexte du nouveau tenant.
   *
   * Le cabinet par défaut (id=1) n'est pas seedé ici car il l'est
   * déjà via le seed global au démarrage (main.seeder / seed command).
   */
  protected async onAfterCreate(
    entity: Cabinet,
    _event: InsertEvent<Cabinet>,
  ): Promise<void> {
    // Ne pas seed le cabinet par défaut (seedé globalement)
    if (entity.id === 1) {
      this.logger.log(`Cabinet #1 (défaut) ignoré — seed global déjà effectué`);
      return;
    }

    this.logger.log(`🚀 Cabinet #${entity.id} créé — lancement du seed…`);
    await this.tenantSeeder.seedForNewCabinet(entity.id);
    this.logger.log(`✅ Seed terminé pour cabinet #${entity.id}`);
  }
}
