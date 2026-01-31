import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { Jurisdiction, JurisdictionLevel, JurisdictionType } from '../entities/jurisdiction.entity';


export default class JurisdictionSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(Jurisdiction);

    const jurisdictions = [
      // Tribunaux de première instance
      {
        code: 'TPI_YAOUNDE',
        name: 'Tribunal de Première Instance de Yaoundé',
        description: 'Tribunal de première instance de la ville de Yaoundé',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.CIVIL,
        city: 'Yaoundé',
        region: 'Centre',
        country: 'Cameroun',
        address: 'Boulevard du 20 Mai, Yaoundé',
        phone: '+237 222 22 00 00',
        email: 'tpi-yaounde@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'TPI-YAOUNDE-001',
          judge_name: 'Honorable Justice Jean Mbarga',
          working_hours: ['08:00-13:00', '14:00-17:00'],
          timezone: 'Africa/Douala'
        }
      },
      {
        code: 'TPI_DOUALA',
        name: 'Tribunal de Première Instance de Douala',
        description: 'Tribunal de première instance économique de Douala',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.COMMERCIAL,
        city: 'Douala',
        region: 'Littoral',
        country: 'Cameroun',
        address: 'Avenue des Banques, Douala',
        phone: '+237 233 40 00 00',
        email: 'tpi-douala@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'TPI-DOUALA-001',
          judge_name: 'Honorable Justice Marie Ngo',
          working_hours: ['08:00-13:00', '14:00-17:00'],
          timezone: 'Africa/Douala'
        }
      },
      {
        code: 'TPI_BAMENDA',
        name: 'Tribunal de Première Instance de Bamenda',
        description: 'Tribunal de première instance de la région du Nord-Ouest',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.CIVIL,
        city: 'Bamenda',
        region: 'Nord-Ouest',
        country: 'Cameroun',
        address: 'Rue Principale, Bamenda',
        phone: '+237 233 36 00 00',
        is_active: true,
        metadata: {
          court_number: 'TPI-BAMENDA-001',
          judge_name: 'Honorable Justice Paul Ngwa'
        }
      },

      // Cours d'appel
      {
        code: 'CA_YAOUNDE',
        name: 'Cour d\'Appel de Yaoundé',
        description: 'Cour d\'appel de la région du Centre',
        level: JurisdictionLevel.NATIONAL,
        jurisdiction_type: JurisdictionType.CIVIL,
        city: 'Yaoundé',
        region: 'Centre',
        country: 'Cameroun',
        address: 'Siège de la Cour d\'Appel, Yaoundé',
        phone: '+237 222 23 00 00',
        email: 'cour-appel-yaounde@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'CA-YAOUNDE-001',
          president: 'Honorable Premier Président Samuel Eto\'o'
        }
      },
      {
        code: 'CA_DOUALA',
        name: 'Cour d\'Appel de Douala',
        description: 'Cour d\'appel de la région du Littoral',
        level: JurisdictionLevel.NATIONAL,
        jurisdiction_type: JurisdictionType.COMMERCIAL,
        city: 'Douala',
        region: 'Littoral',
        country: 'Cameroun',
        address: 'Palais de Justice, Douala',
        phone: '+237 233 41 00 00',
        email: 'cour-appel-douala@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'CA-DOUALA-001',
          president: 'Honorable Premier Président Chantal Biya'
        }
      },

      // Tribunaux de commerce
      {
        code: 'TC_DOUALA',
        name: 'Tribunal de Commerce de Douala',
        description: 'Tribunal spécialisé en droit commercial à Douala',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.COMMERCIAL,
        city: 'Douala',
        region: 'Littoral',
        country: 'Cameroun',
        address: 'Avenue du Commerce, Douala',
        phone: '+237 233 42 00 00',
        email: 'tribunal-commerce@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'TC-DOUALA-001',
          judge_name: 'Honorable Justice Commerce Alain Fokou'
        }
      },

      // Tribunaux du travail
      {
        code: 'TT_YAOUNDE',
        name: 'Tribunal du Travail de Yaoundé',
        description: 'Tribunal spécialisé en droit du travail',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.LABOR,
        city: 'Yaoundé',
        region: 'Centre',
        country: 'Cameroun',
        address: 'Boulevard du Travail, Yaoundé',
        phone: '+237 222 24 00 00',
        email: 'tribunal-travail@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'TT-YAOUNDE-001',
          judge_name: 'Honorable Justice Travail Martine Owona'
        }
      },

      // Tribunaux pour enfants
      {
        code: 'TE_YAOUNDE',
        name: 'Tribunal pour Enfants de Yaoundé',
        description: 'Tribunal spécialisé pour les affaires impliquant des mineurs',
        level: JurisdictionLevel.REGIONAL,
        jurisdiction_type: JurisdictionType.FAMILY,
        city: 'Yaoundé',
        region: 'Centre',
        country: 'Cameroun',
        address: 'Rue de la Protection, Yaoundé',
        phone: '+237 222 25 00 00',
        is_active: true,
        metadata: {
          court_number: 'TE-YAOUNDE-001',
          judge_name: 'Honorable Justice Enfants Geneviève Ngo'
        }
      },

      // Cour Suprême
      {
        code: 'COUR_SUPREME',
        name: 'Cour Suprême du Cameroun',
        description: 'Plus haute juridiction de l\'État du Cameroun',
        level: JurisdictionLevel.NATIONAL,
        jurisdiction_type: JurisdictionType.ADMINISTRATIVE,
        city: 'Yaoundé',
        region: 'Centre',
        country: 'Cameroun',
        address: 'Siège de la Cour Suprême, Yaoundé',
        phone: '+237 222 20 00 00',
        email: 'cour-supreme@justice.cm',
        is_active: true,
        metadata: {
          court_number: 'CS-CM-001',
          president: 'Honorable Premier Président Daniel Mekongo'
        }
      }
    ];

    for (const jurisdictionData of jurisdictions) {
      const existing = await repository.findOne({
        where: { code: jurisdictionData.code }
      });

      if (!existing) {
        const jurisdiction = repository.create(jurisdictionData);
        await repository.save(jurisdiction);
        console.log(`Juridiction créée: ${jurisdiction.name}`);
      }
    }
  }
}