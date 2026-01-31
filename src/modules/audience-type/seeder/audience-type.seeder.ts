import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { AudienceType, AudienceTypeCategory } from '../entities/audience-type.entity';


export default class AudienceTypeSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(AudienceType);

    const audienceTypes = [
      {
        code: 'AUD_PRELIM',
        name: 'Audience Préliminaire',
        description: 'Première audience de mise en état',
        category: AudienceTypeCategory.PRELIMINARY,
        default_duration_minutes: 30,
        is_public: true,
        requires_lawyer: true,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 7,
          required_documents: [1, 2, 3], // IDs des documents types requis
          possible_outcomes: [
            'Mise en état',
            'Renvoi',
            'Jugement sur le fond'
          ],
          legal_basis: 'Article 750 du Code de Procédure Civile'
        }
      },
      {
        code: 'AUD_MISE_ETAT',
        name: 'Audience de Mise en État',
        description: 'Audience pour la mise en état du dossier',
        category: AudienceTypeCategory.PRELIMINARY,
        default_duration_minutes: 60,
        is_public: true,
        requires_lawyer: true,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 14,
          required_documents: [4, 5, 6],
          legal_basis: 'Article 755 du Code de Procédure Civile'
        }
      },
      {
        code: 'AUD_PLAIDOIRIE',
        name: 'Audience de Plaidoirie',
        description: 'Audience pour les plaidoiries des parties',
        category: AudienceTypeCategory.HEARING,
        default_duration_minutes: 120,
        is_public: true,
        requires_lawyer: true,
        allows_remote: false,
        is_active: true,
        metadata: {
          preparation_time_days: 30,
          required_documents: [7, 8, 9],
          possible_outcomes: [
            'Jugement immédiat',
            'Mise en délibéré',
            'Renvoi pour supplément d\'instruction'
          ]
        }
      },
      {
        code: 'AUD_INSTRUCTION',
        name: 'Audience d\'Instruction',
        description: 'Audience pour l\'instruction de l\'affaire',
        category: AudienceTypeCategory.HEARING,
        default_duration_minutes: 90,
        is_public: false,
        requires_lawyer: true,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 21,
          required_documents: [10, 11]
        }
      },
      {
        code: 'AUD_CONCILIATION',
        name: 'Audience de Conciliation',
        description: 'Tentative de conciliation entre les parties',
        category: AudienceTypeCategory.CONCILIATION,
        default_duration_minutes: 60,
        is_public: false,
        requires_lawyer: false,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 7,
          possible_outcomes: [
            'Accord',
            'Échec de la conciliation',
            'Report'
          ]
        }
      },
      {
        code: 'AUD_JUGEMENT',
        name: 'Audience de Jugement',
        description: 'Prononcé du jugement',
        category: AudienceTypeCategory.JUDGMENT,
        default_duration_minutes: 30,
        is_public: true,
        requires_lawyer: false,
        allows_remote: false,
        is_active: true,
        metadata: {
          preparation_time_days: 3,
          required_documents: [12]
        }
      },
      {
        code: 'AUD_APPEL',
        name: 'Audience d\'Appel',
        description: 'Audience devant la cour d\'appel',
        category: AudienceTypeCategory.APPEAL,
        default_duration_minutes: 180,
        is_public: true,
        requires_lawyer: true,
        allows_remote: false,
        is_active: true,
        metadata: {
          preparation_time_days: 60,
          required_documents: [13, 14, 15],
          legal_basis: 'Article 543 du Code de Procédure Civile'
        }
      },
      {
        code: 'AUD_EXPERTISE',
        name: 'Audience d\'Expertise',
        description: 'Désignation et audition d\'expert',
        category: AudienceTypeCategory.EXPERTISE,
        default_duration_minutes: 120,
        is_public: false,
        requires_lawyer: true,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 30,
          required_documents: [16, 17]
        }
      },
      {
        code: 'AUD_CASSATION',
        name: 'Audience de Cassation',
        description: 'Audience devant la Cour Suprême',
        category: AudienceTypeCategory.CASATION,
        default_duration_minutes: 240,
        is_public: true,
        requires_lawyer: true,
        allows_remote: false,
        is_active: true,
        metadata: {
          preparation_time_days: 90,
          required_documents: [18, 19, 20],
          legal_basis: 'Loi n°2006/015 du 29 décembre 2006'
        }
      },
      {
        code: 'AUD_URGENCE',
        name: 'Audience en Référé',
        description: 'Audience en urgence pour mesures provisoires',
        category: AudienceTypeCategory.HEARING,
        default_duration_minutes: 45,
        is_public: true,
        requires_lawyer: true,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 2,
          required_documents: [21, 22],
          legal_basis: 'Article 808 du Code de Procédure Civile'
        }
      },
      {
        code: 'AUD_FAMILLE',
        name: 'Audience aux Affaires Familiales',
        description: 'Audience spécialisée en droit de la famille',
        category: AudienceTypeCategory.HEARING,
        default_duration_minutes: 90,
        is_public: false,
        requires_lawyer: false,
        allows_remote: true,
        is_active: true,
        metadata: {
          preparation_time_days: 14,
          required_documents: [23, 24]
        }
      },
      {
        code: 'AUD_COMMERCE',
        name: 'Audience Commerciale',
        description: 'Audience devant le tribunal de commerce',
        category: AudienceTypeCategory.HEARING,
        default_duration_minutes: 120,
        is_public: true,
        requires_lawyer: true,
        allows_remote: false,
        is_active: true,
        metadata: {
          preparation_time_days: 21,
          required_documents: [25, 26],
          legal_basis: 'Code de Commerce camerounais'
        }
      }
    ];

    for (const typeData of audienceTypes) {
      const existing = await repository.findOne({
        where: { code: typeData.code }
      });

      if (!existing) {
        const audienceType = repository.create(typeData);
        await repository.save(audienceType);
        console.log(`Type d'audience créé: ${audienceType.name}`);
      }
    }
  }
}