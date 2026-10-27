/* eslint-disable no-console */
/**
 * Rapprochement des dépenses approuvées non synchronisées :
 *
 *   npm run billing:reconcile -- --tenant 22            # dry-run (liste)
 *   npm run billing:reconcile -- --tenant 22 --apply    # crée les éléments manquants
 *
 * Options : --dossier <id>, --limit <n> (défaut 200, max 1000),
 * --actor <id> (défaut : système), --json.
 */
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { BillingReconciliationService } from '../modules/case-workflow/services/billing-reconciliation.service';

dotenv.config();

async function main(): Promise<void> {
  const program = new Command();
  program
    .description('Rapproche dépenses approuvées → éléments facturables')
    .requiredOption('--tenant <id>', 'Identifiant du cabinet', Number)
    .option('--dossier <id>', 'Restreindre à un dossier', Number)
    .option('--limit <n>', 'Nombre max de lignes traitées', Number, 200)
    .option('--apply', 'Créer les éléments manquants (défaut : dry-run)', false)
    .option('--actor <id>', 'Utilisateur auteur (défaut : système)', Number)
    .option('--json', 'Sortie JSON', false);
  program.parse(process.argv);
  const options = program.opts() as {
    tenant: number;
    dossier?: number;
    limit: number;
    apply: boolean;
    actor?: number;
    json: boolean;
  };

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(BillingReconciliationService);
    const report = await service.reconcile({
      tenantId: options.tenant,
      dossierId: options.dossier,
      limit: options.limit,
      apply: options.apply,
      actorUserId: options.actor ?? null,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (!options.apply) {
      console.log(
        `[dry-run] ${report.examined} ligne(s) approuvée(s) sans élément facturable (cabinet ${report.tenant_id}).`,
      );
      for (const line of report.missing) {
        console.log(
          `  - ligne ${line.expense_line_id} (note ${line.expense_report_id}, dossier ${line.dossier_id}) : ${line.amount_ttc} — ${line.description ?? 'sans libellé'}`,
        );
      }
    } else {
      console.log(
        `[apply] ${report.synced.length} synchronisée(s), ${report.failed.length} en échec (cabinet ${report.tenant_id}).`,
      );
      for (const failure of report.failed) {
        console.log(`  ! ligne ${failure.expense_line_id} : ${failure.error}`);
      }
    }
    process.exitCode = report.failed.length > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

void main();
