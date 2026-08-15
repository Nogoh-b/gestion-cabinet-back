import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { Plan } from '../entities/plan.entity';


export default class PlanSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(Plan);

    const plans = [
      {
        name: 'Free',
        code: 'free',
        description: 'Pour découvrir la plateforme. Idéal pour démarrer gratuitement.',
        max_employees: 1,
        max_storage_gb: 1,
        max_dossiers: 10,
        max_clients: 20,
        max_branches: 1,
        max_audiences: 30,
        payroll_enabled: false,
        max_payslips_per_month: null,
        expenses_enabled: false,
        max_expenses_per_month: null,
        documents_enabled: true,
        invoicing_enabled: false,
        reporting_enabled: false,
        support_level: 'community',
        ai_enabled: false,
        ai_requests_per_month: null,
        price_monthly: 0,
        price_yearly: null,
        features: JSON.stringify(['Gestion des dossiers', 'Clients', 'Documents']),
        is_active: true,
        trial_enabled: false,
        trial_days: 0,
        min_commitment_months: 0,
      },
      {
        name: 'Starter',
        code: 'starter',
        description: 'Pour les avocats indépendants. Tout le nécessaire au quotidien.',
        max_employees: 3,
        max_storage_gb: 10,
        max_dossiers: 100,
        max_clients: 300,
        max_branches: 1,
        max_audiences: -1,
        payroll_enabled: false,
        max_payslips_per_month: null,
        expenses_enabled: true,
        max_expenses_per_month: 50,
        documents_enabled: true,
        invoicing_enabled: true,
        reporting_enabled: false,
        support_level: 'email',
        ai_enabled: true,
        ai_requests_per_month: 100,
        price_monthly: 9900,
        price_yearly: 99000,
        features: JSON.stringify([
          'Gestion des dossiers',
          'Clients',
          'Documents',
          'Facturation',
          'Gestion des dépenses',
          'Assistant IA (100 req/mois)',
        ]),
        is_active: true,
        trial_enabled: true,
        trial_days: 14,
        min_commitment_months: 12,
      },
      {
        name: 'Cabinet',
        code: 'cabinet',
        description: 'Pour les cabinets en croissance avec une équipe et la paie.',
        max_employees: 15,
        max_storage_gb: 50,
        max_dossiers: 1000,
        max_clients: 3000,
        max_branches: 3,
        max_audiences: -1,
        payroll_enabled: true,
        max_payslips_per_month: 50,
        expenses_enabled: true,
        max_expenses_per_month: 500,
        documents_enabled: true,
        invoicing_enabled: true,
        reporting_enabled: true,
        support_level: 'priority',
        ai_enabled: true,
        ai_requests_per_month: 500,
        price_monthly: 29900,
        price_yearly: 299000,
        features: JSON.stringify([
          'Tout du plan Avocat',
          'Paie & bulletins',
          'Multi-agences (3)',
          'Rapports avancés',
          'Assistant IA (500 req/mois)',
          'Support prioritaire',
        ]),
        is_active: true,
        trial_enabled: true,
        trial_days: 30,
        min_commitment_months: 12,
      },
      {
        name: 'Firme',
        code: 'firme',
        description: 'Pour les grandes structures : quotas illimités et IA illimitée.',
        max_employees: -1,
        max_storage_gb: -1,
        max_dossiers: -1,
        max_clients: -1,
        max_branches: -1,
        max_audiences: -1,
        payroll_enabled: true,
        max_payslips_per_month: null,
        expenses_enabled: true,
        max_expenses_per_month: null,
        documents_enabled: true,
        invoicing_enabled: true,
        reporting_enabled: true,
        support_level: 'dedicated',
        ai_enabled: true,
        ai_requests_per_month: null,
        price_monthly: 79900,
        price_yearly: 799000,
        features: JSON.stringify([
          'Tout du plan Cabinet',
          'Quotas illimités',
          'IA illimitée',
          'Multi-agences illimité',
          'Intégrations personnalisées',
          'Support dédié & SLA',
        ]),
        is_active: true,
        trial_enabled: false,
        trial_days: 0,
        min_commitment_months: 0,
      },
    ];

    for (const planData of plans) {
      const existing = await repository.findOne({ where: { code: planData.code } });
      if (!existing) {
        const plan = repository.create(planData);
        await repository.save(plan);
        console.log(`Plan créé : ${plan.name} (${plan.code})`);
      } else {
        // Met à jour les paramètres (nouveaux champs modules/quotas) sur les plans existants
        await repository.update({ code: planData.code }, planData);
        console.log(`Plan mis à jour : ${planData.code}`);
      }
    }
  }
}
