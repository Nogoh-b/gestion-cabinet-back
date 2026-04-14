// type-customer.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { TypeCustomer } from '../entities/type_customer.entity';

export default class TypeCustomerSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(TypeCustomer); 

    const typeCustomers = [
      {
        name: 'Client Particulier',
        code: 'PARTICULIER',
        status: 1,
        requiredDocuments: [1, 2, 3] // IDs des documents types requis (à ajuster selon votre base)
      },
      {
        name: 'Client Professionnel',
        code: 'PROFESSIONNEL',
        status: 1,
        requiredDocuments: [4, 5, 6, 7]
      },
      {
        name: 'Entreprise',
        code: 'ENTREPRISE',
        status: 1,
        requiredDocuments: [4, 5, 6, 8, 9]
      },
      {
        name: 'Association',
        code: 'ASSOCIATION',
        status: 1,
        requiredDocuments: [4, 5, 10]
      },
      {
        name: 'Collectivité',
        code: 'COLLECTIVITE',
        status: 1,
        requiredDocuments: [4, 5, 11]
      },
      {
        name: 'Étranger',
        code: 'ETRANGER',
        status: 1,
        requiredDocuments: [1, 2, 12, 13]
      },
      {
        name: 'Administration',
        code: 'ADMINISTRATION',
        status: 1,
        requiredDocuments: [4, 5, 14]
      },
      {
        name: 'Cabinet d\'Avocats',
        code: 'CABINET_AVOCAT',
        status: 1,
        requiredDocuments: [4, 5, 6, 15]
      },
      {
        name: 'Expert Comptable',
        code: 'EXPERT_COMPTABLE',
        status: 1,
        requiredDocuments: [4, 5, 6, 16]
      },
      {
        name: 'Notaire',
        code: 'NOTAIRE',
        status: 1,
        requiredDocuments: [4, 5, 6, 17]
      },
      {
        name: 'Huissier de Justice',
        code: 'HUISSIER',
        status: 1,
        requiredDocuments: [4, 5, 6, 18]
      },
      {
        name: 'Société Civile',
        code: 'SOCIETE_CIVILE',
        status: 1,
        requiredDocuments: [4, 5, 6, 19]
      },
      {
        name: 'Coopérative',
        code: 'COOPERATIVE',
        status: 1,
        requiredDocuments: [4, 5, 10, 20]
      },
      {
        name: 'Microfinance',
        code: 'MICROFINANCE',
        status: 1,
        requiredDocuments: [4, 5, 6, 21]
      },
      {
        name: 'Organisme Public',
        code: 'ORGANISME_PUBLIC',
        status: 1,
        requiredDocuments: [4, 5, 22]
      },
      {
        name: 'ONG',
        code: 'ONG',
        status: 1,
        requiredDocuments: [4, 5, 10, 23]
      },
      {
        name: 'Syndicat',
        code: 'SYNDICAT',
        status: 1,
        requiredDocuments: [4, 5, 10]
      },
      {
        name: 'Fondation',
        code: 'FONDATION',
        status: 1,
        requiredDocuments: [4, 5, 10, 24]
      },
      {
        name: 'Groupement d\'Intérêt Économique',
        code: 'GIE',
        status: 1,
        requiredDocuments: [4, 5, 6, 25]
      },
      {
        name: 'Société d\'État',
        code: 'SOCIETE_ETAT',
        status: 1,
        requiredDocuments: [4, 5, 22, 26]
      }
    ];

    for (const typeData of typeCustomers) {
      const existing = await repository.findOne({
        where: { code: typeData.code }
      });

      if (!existing) {
        const typeCustomer = repository.create({
          name: typeData.name,
          code: typeData.code,
          status: typeData.status
        });
        
        await repository.save(typeCustomer);
        console.log(`Type de client créé: ${typeCustomer.name} (${typeCustomer.code})`);
      } else {
        console.log(`Type de client existe déjà: ${existing.name} (${existing.code})`);
      }
    }

    console.log('Seeder TypeCustomer terminé avec succès !');
  }
}