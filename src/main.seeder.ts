import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';



import AudienceTypeSeeder from './modules/audience-type/seeder/audience-type.seeder';
import ChatGroupConversationSeeder from './modules/chat/seeder/chat-group-conversation.seeder';
import TypeCustomerSeeder from './modules/customer/type-customer/seeder/type-customer.seeder';
import DocumentCategorySeeder from './modules/document-category/seeder/document-category.seeder';
import DocumentTypeSeeder from './modules/documents/document-type/seeder/document-type.seeder';
import LocationSeeder from './modules/geography/seeder/location.seeder';
import InvoiceTypeSeeder from './modules/invoice-type/seeder/invoice-type.seeder';
import JurisdictionSeeder from './modules/jurisdiction/seeder/jurisdiction.seeder';
import DefaultProcedureTemplateSeeder from './modules/procedure/seeder/default-procedure-template.seeder';
import ProcedureTemplateSeeder from './modules/procedure/seeder/procedure-template.seeder';
import ProcedureSubtypeSeeder from './modules/procedures/seeder/procedure-subtype.seeder';
import ProcedureTypeSeeder from './modules/procedures/seeder/procedure-type.seeder';
import PlanSeeder from './modules/plans/seeder/plan.seeder';



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
        DefaultProcedureTemplateSeeder,
        ProcedureTemplateSeeder,
        PlanSeeder,
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
    console.log('   - Plans d\'abonnement (Starter, Pro, Business, Enterprise)');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution des seeders:', error);
    throw error;
  }
}

export default { seedDatabase };