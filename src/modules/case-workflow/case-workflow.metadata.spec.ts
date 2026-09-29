import { describe, expect, it } from '@jest/globals';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BUSINESS_METADATA_KEY } from 'src/core/decorators/business-metadata.decorator';
import { Cycle } from 'src/modules/procedure/entities/cycle.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { ProcedureTemplate } from 'src/modules/procedure/entities/procedure-template.entity';
import { Stage } from 'src/modules/procedure/entities/stage.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { Task } from 'src/modules/procedure/entities/task.entity';
import { Transition } from 'src/modules/procedure/entities/transition.entity';
import { BillableItem } from './entities/billing.entity';
import { DossierAction } from './entities/dossier-action.entity';

describe('case-workflow MariaDB metadata', () => {
  it('construit toutes les métadonnées TypeORM sans type Object implicite', async () => {
    const dataSource = new DataSource({
      type: 'mariadb',
      host: 'localhost',
      username: 'metadata-only',
      database: 'metadata-only',
      entities: [join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
    });

    await expect(
      (
        dataSource as unknown as { buildMetadatas(): Promise<void> }
      ).buildMetadatas(),
    ).resolves.toBeUndefined();
  }, 60_000);

  it('distingue explicitement avancement, décision et état de facturation', () => {
    const actionStatus = Reflect.getMetadata(
      BUSINESS_METADATA_KEY,
      DossierAction.prototype,
      'status',
    );
    const billingDecision = Reflect.getMetadata(
      BUSINESS_METADATA_KEY,
      DossierAction.prototype,
      'billing_decision',
    );
    const itemStatus = Reflect.getMetadata(
      BUSINESS_METADATA_KEY,
      BillableItem.prototype,
      'status',
    );

    expect(actionStatus.description).toContain(
      'COMPLETED ne signifie jamais à lui seul',
    );
    expect(billingDecision.description).toContain(
      'Seule la valeur BILLABLE',
    );
    expect(itemStatus.description).toContain(
      'Seul TO_INVOICE signifie',
    );
  });

  it('masque les entités de l’ancien moteur de procédure', () => {
    const legacyEntities = [
      Cycle,
      ProcedureInstance,
      ProcedureTemplate,
      Stage,
      SubStage,
      Task,
      Transition,
    ];

    legacyEntities.forEach((entity) => {
      expect(Reflect.getMetadata(BUSINESS_METADATA_KEY, entity)).toEqual(
        expect.objectContaining({ ignored: true }),
      );
    });
  });
});
