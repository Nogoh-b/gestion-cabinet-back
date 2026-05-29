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
        name: 'Starter',
        code: 'starter',
        description: 'Idéal pour les avocats indépendants qui débutent.',
        max_employees: 3,
        max_storage_gb: 5,
        max_dossiers: 50,
        max_clients: 100,
        ai_enabled: false,
        ai_requests_per_month: null,
        price_monthly: 0,
        price_yearly: null,
        features: JSON.stringify(['Gestion des dossiers', 'Clients', 'Documents']),
        is_active: true,
      },
      {
        name: 'Pro',
        code: 'pro',
        description: 'Pour les cabinets en croissance avec des besoins avancés.',
        max_employees: 10,
        max_storage_gb: 20,
        max_dossiers: 500,
        max_clients: 1000,
        ai_enabled: true,
        ai_requests_per_month: 200,
        price_monthly: 19900,
        price_yearly: 199000,
        features: JSON.stringify([
          'Gestion des dossiers',
          'Clients',
          'Documents',
          'Intelligence artificielle',
          'Rapports avancés',
          'Facturation',
        ]),
        is_active: true,
      },
      {
        name: 'Business',
        code: 'business',
        description: 'Pour les grands cabinets avec des volumes importants.',
        max_employees: 50,
        max_storage_gb: 100,
        max_dossiers: 5000,
        max_clients: 10000,
        ai_enabled: true,
        ai_requests_per_month: 1000,
        price_monthly: 49900,
        price_yearly: 499000,
        features: JSON.stringify([
          'Gestion des dossiers',
          'Clients',
          'Documents',
          'Intelligence artificielle illimitée',
          'Rapports avancés',
          'Facturation',
          'Multi-cabinets',
          'Support prioritaire',
        ]),
        is_active: true,
      },
      {
        name: 'Enterprise',
        code: 'enterprise',
        description: 'Solution sur-mesure pour les grands groupes d\'avocats.',
        max_employees: -1,
        max_storage_gb: -1,
        max_dossiers: -1,
        max_clients: -1,
        ai_enabled: true,
        ai_requests_per_month: null,
        price_monthly: 0,
        price_yearly: null,
        features: JSON.stringify([
          'Tout Business inclus',
          'Quotas illimités',
          'IA illimitée',
          'Intégrations personnalisées',
          'SLA dédié',
          'Formation équipe',
        ]),
        is_active: true,
      },
    ];

    for (const planData of plans) {
      const existing = await repository.findOne({ where: { code: planData.code } });
      if (!existing) {
        const plan = repository.create(planData);
        await repository.save(plan);
        console.log(`Plan créé : ${plan.name} (${plan.code})`);
      } else {
        console.log(`Plan déjà existant, ignoré : ${planData.code}`);
      }
    }
  }
}
