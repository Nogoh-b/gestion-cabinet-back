import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';

import AudienceTypeSeeder from './modules/audience-type/seeder/audience-type.seeder';
import DocumentCategorySeeder from './modules/document-category/seeder/document-category.seeder';
import InvoiceTypeSeeder from './modules/invoice-type/seeder/invoice-type.seeder';
import JurisdictionSeeder from './modules/jurisdiction/seeder/jurisdiction.seeder';
import ProcedureTypeSeeder from './modules/procedures/seeder/procedure-type.seeder';
import ProcedureSubtypeSeeder from './modules/procedures/seeder/procedure-subtype.seeder';
import ProcedureTemplateSeeder from './modules/procedure/seeder/procedure-template.seeder';
import DocumentTypeSeeder from './modules/documents/document-type/seeder/document-type.seeder';
import TypeCustomerSeeder from './modules/customer/type-customer/seeder/type-customer.seeder';
import LocationSeeder from './modules/geography/seeder/location.seeder';
import ChatGroupConversationSeeder from './modules/chat/seeder/chat-group-conversation.seeder';
// src/database/seeders/index.ts


export async function seedDatabase(dataSource: DataSource) {
  try {
    console.log('🚀 Démarrage des seeders...');
    
    await runSeeders(dataSource, {
      seeds: [
        JurisdictionSeeder,
        DocumentCategorySeeder,
        DocumentTypeSeeder,
        LocationSeeder,
        AudienceTypeSeeder,
        TypeCustomerSeeder,
        ChatGroupConversationSeeder,
        InvoiceTypeSeeder,
        ProcedureTypeSeeder,
        ProcedureSubtypeSeeder,
        ProcedureTemplateSeeder
      ]
    });

    console.log('✅ Seeders exécutés avec succès!');
    console.log('📋 Données initiales créées:');
    console.log('   - Juridictions camerounaises');
    console.log('   - Catégories de documents');
    console.log('   - Types d\'audience');
    console.log('   - Types de factures (en FCFA)');
    console.log('   - Types de procédure');
    console.log('   - Sous-types de procédure');
    console.log('   - Template de procédure avec stages, transitions et cycles');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution des seeders:', error);
    throw error;
  }
}

export default { seedDatabase };