import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';

import AudienceTypeSeeder from './modules/audience-type/seeder/audience-type.seeder';
import DocumentCategorySeeder from './modules/document-category/seeder/document-category.seeder';
import InvoiceTypeSeeder from './modules/invoice-type/seeder/invoice-type.seeder';
import JurisdictionSeeder from './modules/jurisdiction/seeder/jurisdiction.seeder';


export async function seedDatabase(dataSource: DataSource) {
  try {
    console.log('🚀 Démarrage des seeders...');
    
    await runSeeders(dataSource, {
      seeds: [
        JurisdictionSeeder,
        DocumentCategorySeeder,
        AudienceTypeSeeder,
        InvoiceTypeSeeder
      ]
    });

    console.log('✅ Seeders exécutés avec succès!');
    console.log('📋 Données initiales créées:');
    console.log('   - Juridictions camerounaises');
    console.log('   - Catégories de documents');
    console.log('   - Types d\'audience');
    console.log('   - Types de factures (en FCFA)');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution des seeders:', error);
    throw error;
  }
}

// Export par défaut aussi pour compatibilité
export default { seedDatabase };