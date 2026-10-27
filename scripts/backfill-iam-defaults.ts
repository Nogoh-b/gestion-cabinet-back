import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { TenantSeederService } from 'src/modules/cabinet/tenant-seeder.service';

/**
 * Rattrapage ponctuel des permissions « par défaut pour tous » sur les cabinets
 * existants : view_dashboard (tout le monde), view_user_directory (annuaire des
 * selects), manage_invoice_settings (config facturation).
 *
 * Usage : npm run iam:backfill-defaults
 *
 * Les permissions sont portées par le RÔLE : accorder view_dashboard au rôle
 * « avocat » l'accorde à tous les avocats existants, sans écrire par utilisateur.
 * Idempotent : relancer le script n'ajoute que ce qui manque.
 */
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    await app.get(TenantSeederService).backfillIamDefaultsForAllTenants();
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Rattrapage IAM en échec :', err);
    process.exit(1);
  });
