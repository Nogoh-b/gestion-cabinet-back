// src/modules/procedures/seeder/procedure-type.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ProcedureType } from '../entities/procedure.entity';

export default class ProcedureTypeSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(ProcedureType);

    const procedureTypes = [
      {
        name: 'Procédure Civile Ordinaire',
        code: 'CIVIL_ORDINARY',
        description: 'Procédure civile standard devant le tribunal judiciaire',
        required_documents: ['assignation', 'conclusions', 'pieces_justificatives'],
        average_duration: 180,
        specific_jurisdictions: ['Tribunal Judiciaire', 'Cour d\'Appel'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 1
      },
      {
        name: 'Procédure Spéciale (OHADA)',
        code: 'OHADA_SPECIAL',
        description: 'Procédures uniformes OHADA (injonction de payer, saisies, etc.)',
        required_documents: ['requete', 'ordonnance', 'signification'],
        average_duration: 45,
        specific_jurisdictions: ['Tribunal de Commerce', 'Cour d\'Appel'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 2
      },
      {
        name: 'Procédure d\'Urgence',
        code: 'URGENCY',
        description: 'Procédures accélérées en cas d\'urgence (référé)',
        required_documents: ['assignation_urgence', 'ordonnance_refere'],
        average_duration: 15,
        specific_jurisdictions: ['Tribunal Judiciaire', 'Tribunal de Commerce'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 3
      },
      {
        name: 'Voies de Recours',
        code: 'APPEAL_REMEDIES',
        description: 'Voies de recours contre les décisions de justice',
        required_documents: ['declaration_appel', 'memoire', 'conclusions'],
        average_duration: 120,
        specific_jurisdictions: ['Cour d\'Appel', 'Cour Suprême'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 4
      },
      {
        name: 'Exécution des Décisions',
        code: 'ENFORCEMENT',
        description: 'Procédures d\'exécution forcée des décisions judiciaires',
        required_documents: ['titre_executoire', 'commandement', 'saisie'],
        average_duration: 60,
        specific_jurisdictions: ['Juge de l\'Exécution', 'Tribunal Judiciaire'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 5
      },
      {
        name: 'Procédure Administrative',
        code: 'ADMINISTRATIVE',
        description: 'Contentieux administratif et fiscal',
        required_documents: ['recours_gracieux', 'requete', 'memoire_explicatif'],
        average_duration: 150,
        specific_jurisdictions: ['Chambre Administrative', 'Cour Suprême'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 6
      },
      {
        name: 'Procédure Pénale',
        code: 'CRIMINAL',
        description: 'Procédure pénale (enquête, instruction, jugement)',
        required_documents: ['plainte', 'denonciation', 'citation'],
        average_duration: 90,
        specific_jurisdictions: ['Tribunal de Première Instance', 'Cour d\'Appel'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 7
      },
      {
        name: 'Procédure Commerciale & OHADA',
        code: 'COMMERCIAL_OHADA',
        description: 'Procédures collectives et commerciales OHADA',
        required_documents: ['declaration_cessation_paiements', 'bilan', 'comptes'],
        average_duration: 240,
        specific_jurisdictions: ['Tribunal de Commerce', 'Cour d\'Appel'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 8
      },
      {
        name: 'Procédure Traditionnelle',
        code: 'CUSTOMARY',
        description: 'Justice coutumière (divorce, succession, foncier coutumier)',
        required_documents: ['saisine_chef', 'attestation_notables', 'decision_coutumiere'],
        average_duration: 30,
        specific_jurisdictions: ['Tribunal Coutumier', 'Tribunal Moderne'],
        is_active: true,
        is_subtype: false,
        hierarchy_level: 1,
        
        order: 9
      }
    ];

    const savedTypes: ProcedureType[] = [];

    for (const typeData of procedureTypes) {
      const existing = await repository.findOne({
        where: { code: typeData.code }
      });

      if (!existing) {
        const procedureType = repository.create(typeData);
        const saved = await repository.save(procedureType);
        savedTypes.push(saved);
        console.log(`✅ Type de procédure créé: ${saved.name} (${saved.code})`);
      } else {
        savedTypes.push(existing);
        console.log(`⏩ Type de procédure existant: ${existing.name}`);
      }
    }

    return savedTypes;
  }
}