import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { CustomerAiResolver } from './resolvers/customer-ai-resolver';
import { EmployeeAiResolver } from './resolvers/employee-ai-resolver';
import { AI_DATABASE_PROJECT_CONFIG } from 'src/core/ai-database/ai-database.tokens';
import { AiDatabaseProjectConfig } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';
import {
  CABINET_JURIDIQUE_PROMPT_RULES,
  CABINET_JURIDIQUE_PROMPT_EXAMPLE,
  CABINET_JURIDIQUE_CONVERSATIONAL_PROMPT,
  CABINET_JURIDIQUE_ANALYSIS_PROMPT,
} from './cabinet-juridique-prompt';
import { NEVER_AUTO_CREATE_ENTITIES } from './never-auto-create.config';
import { FIELD_LABELS } from './field-labels.config';
import { DATABASE_TABLES_CONFIG } from './database-tables.config';

/**
 * Module de configuration projet pour AiDatabaseModule.
 *
 * Ce module est @Global() : le token AI_DATABASE_PROJECT_CONFIG est disponible
 * dans tous les modules de l'application sans import explicite.
 *
 * Pour adapter le système IA à un autre projet :
 *   - Créer un module équivalent avec ses propres resolvers et config
 *   - Importer ce module dans AppModule à la place de celui-ci
 *   - Le module core AiDatabase reste inchangé
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Employee])],
  providers: [
    CustomerAiResolver,
    EmployeeAiResolver,
    {
      provide: AI_DATABASE_PROJECT_CONFIG,
      useFactory: (
        customerResolver: CustomerAiResolver,
        employeeResolver: EmployeeAiResolver,
      ): AiDatabaseProjectConfig => ({
        specializedResolvers: [customerResolver, employeeResolver],
        neverAutoCreate: NEVER_AUTO_CREATE_ENTITIES,
        promptDomainRules: CABINET_JURIDIQUE_PROMPT_RULES,
        promptDomainExample: CABINET_JURIDIQUE_PROMPT_EXAMPLE,
        conversationalSystemPrompt: CABINET_JURIDIQUE_CONVERSATIONAL_PROMPT,
        analysisSystemPrompt: CABINET_JURIDIQUE_ANALYSIS_PROMPT,
        fieldLabels: FIELD_LABELS,
        databaseTablesConfig: DATABASE_TABLES_CONFIG,
      }),
      inject: [CustomerAiResolver, EmployeeAiResolver],
    },
  ],
  exports: [AI_DATABASE_PROJECT_CONFIG],
})
export class AiDatabaseProjectModule {}
