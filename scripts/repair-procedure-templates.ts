import 'dotenv/config';

import dataSource from '../src/data-source';
import { runWithTenantContext } from '../src/core/tenant/tenant.context';
import { TenantRepositoryPatch } from '../src/core/tenant/tenant-repository.patch';
import DefaultProcedureTemplateSeeder from '../src/modules/procedure/seeder/default-procedure-template.seeder';
import ProcedureTemplateSeeder from '../src/modules/procedure/seeder/procedure-template.seeder';

function readTenantId(): number {
  const tenantId = Number(process.argv[2]);
  if (!Number.isInteger(tenantId) || tenantId < 1) {
    throw new Error(
      'Usage: npm run procedure-templates:repair -- <tenant_id positif>',
    );
  }
  return tenantId;
}

async function bootstrap(): Promise<void> {
  const tenantId = readTenantId();
  new TenantRepositoryPatch().onModuleInit();
  await dataSource.initialize();

  try {
    const cabinets = await dataSource.query(
      'SELECT id, name FROM cabinets WHERE id = ? LIMIT 1',
      [tenantId],
    );
    if (!cabinets[0]) {
      throw new Error(`Cabinet ${tenantId} introuvable`);
    }

    await runWithTenantContext(tenantId, async () => {
      await new DefaultProcedureTemplateSeeder().run(dataSource, null as any);
      await new ProcedureTemplateSeeder().run(dataSource, null as any);
    });

    const [coverage] = await dataSource.query(
      `SELECT
         COUNT(*) AS linked_count,
         SUM(CASE
           WHEN template.lifecycle_status = 'PUBLISHED'
             AND template.content_hash IS NOT NULL
           THEN 1 ELSE 0
         END) AS valid_count
       FROM procedure_types AS procedure_type
       INNER JOIN procedure_templates AS template
         ON template.id = procedure_type.procedure_template_id
       WHERE procedure_type.tenant_id = ?`,
      [tenantId],
    );
    const linkedCount = Number(coverage.linked_count);
    const validCount = Number(coverage.valid_count);
    if (linkedCount < 19 || validCount !== linkedCount) {
      throw new Error(
        `Postcondition invalide: ${validCount}/${linkedCount} liaisons pointent vers un template publié et hashé`,
      );
    }

    console.log(
      `Contrôle final: ${validCount}/${linkedCount} liaisons valides (PUBLISHED + hash)`,
    );
    console.log(
      `Réparation des templates terminée pour le cabinet ${tenantId} (${cabinets[0].name})`,
    );
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error('Échec de la réparation des templates de procédure', error);
  process.exitCode = 1;
});
