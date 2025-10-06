import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';

export default class ProcedureTypesSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    // const procedureTypeRepository = dataSource.getRepository(ProcedureType);
    // const procedureSubtypeRepository = dataSource.getRepository(ProcedureSubtype);

    // Types de procédures principaux
    const procedureTypes = [
      { name: 'Civile', code: 'CIVILE', description: 'Procédures civiles' },
      { name: 'Pénale', code: 'PENALE', description: 'Procédures pénales' },
      { name: 'Administrative', code: 'ADMINISTRATIVE', description: 'Procédures administratives' },
      { name: 'Commerciale', code: 'COMMERCIALE', description: 'Procédures commerciales' },
      { name: 'Sociale', code: 'SOCIALE', description: 'Procédures sociales et prud\'homales' },
      { name: 'Familiale', code: 'FAMILIALE', description: 'Procédures familiales' },
      { name: 'Constitutionnelle', code: 'CONSTITUTIONNELLE', description: 'Procédures constitutionnelles et électorales' },
    ];

    const savedTypes = '1' //await procedureTypeRepository.save(procedureTypes);

    // Sous-types par type de procédure
    const procedureSubtypes = [
      // Civile
      { name: 'Divorce', code: 'DIVORCE', procedureType: savedTypes[0] },
      { name: 'Successions', code: 'SUCCESSIONS', procedureType: savedTypes[0] },
      { name: 'Litiges locatifs', code: 'LOYER', procedureType: savedTypes[0] },
      { name: 'Responsabilité contractuelle', code: 'CONTRAT', procedureType: savedTypes[0] },
      
      // Pénale
      { name: 'Contravention', code: 'CONTRAVENTION', procedureType: savedTypes[1] },
      { name: 'Délit', code: 'DELIT', procedureType: savedTypes[1] },
      { name: 'Crime', code: 'CRIME', procedureType: savedTypes[1] },
      { name: 'Appel/Pourvoi', code: 'APPEL_PENAL', procedureType: savedTypes[1] },
      
      // Administrative
      { name: 'Fiscalité', code: 'FISCALITE', procedureType: savedTypes[2] },
      { name: 'Urbanisme', code: 'URBANISME', procedureType: savedTypes[2] },
      { name: 'Fonction publique', code: 'FONCTION_PUBLIQUE', procedureType: savedTypes[2] },
      { name: 'Recours excès de pouvoir', code: 'EXCES_POUVOIR', procedureType: savedTypes[2] },
      
      // Commerciale
      { name: 'Recouvrement de créances', code: 'RECOUVREMENT', procedureType: savedTypes[3] },
      { name: 'Litiges bancaires', code: 'BANCAIRE', procedureType: savedTypes[3] },
      { name: 'Faillite/Liquidation', code: 'FAILLITE', procedureType: savedTypes[3] },
      { name: 'Conflits associés', code: 'CONFLITS_SOC', procedureType: savedTypes[3] },
      
      // Sociale
      { name: 'Licenciement', code: 'LICENCIEMENT', procedureType: savedTypes[4] },
      { name: 'Non-paiement de salaires', code: 'SALAIRE', procedureType: savedTypes[4] },
      { name: 'Harcèlement', code: 'HARCELEMENT', procedureType: savedTypes[4] },
      { name: 'Accidents de travail', code: 'ACCIDENT_TRAVAIL', procedureType: savedTypes[4] },
      
      // Familiale
      { name: 'Divorce amiable', code: 'DIVORCE_AMIABLE', procedureType: savedTypes[5] },
      { name: 'Divorce contentieux', code: 'DIVORCE_CONTENTIEUX', procedureType: savedTypes[5] },
      { name: 'Garde alternée', code: 'GARDE', procedureType: savedTypes[5] },
      { name: 'Adoption', code: 'ADOPTION', procedureType: savedTypes[5] },
      { name: 'Partage successoral', code: 'PARTAGE', procedureType: savedTypes[5] },
      
      // Constitutionnelle
      { name: 'Contestations électorales', code: 'ELECTORAL', procedureType: savedTypes[6] },
      { name: 'Questions de constitutionnalité', code: 'CONSTITUTIONNALITE', procedureType: savedTypes[6] },
    ];

    // await procedureSubtypeRepository.save(procedureSubtypes);
  }
}