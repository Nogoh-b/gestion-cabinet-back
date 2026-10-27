import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';
import LocationSeeder from './modules/geography/seeder/location.seeder';
import PlanSeeder from './modules/plans/seeder/plan.seeder';

/** Tenant defaults are initialized by ReferenceDataService when a cabinet is created.
 * Explicit CLI seeding is limited to shared catalogues and cannot reset a cabinet.
 */
export async function seedDatabase(dataSource: DataSource) {
  await runSeeders(dataSource, { seeds: [LocationSeeder, PlanSeeder] });
  console.log(
    'Catalogues partagés initialisés. Gérez les défauts des cabinets dans Plateforme → Référentiels.',
  );
}
export default { seedDatabase };
