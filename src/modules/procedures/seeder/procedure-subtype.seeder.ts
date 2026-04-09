// src/modules/procedures/seeder/procedure-subtype.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ProcedureType } from '../entities/procedure.entity';

export default class ProcedureSubtypeSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(ProcedureType);

    // Récupérer les types parents
    const civilParent = await repository.findOne({ where: { code: 'CIVIL_ORDINARY' } });
    const ohadaParent = await repository.findOne({ where: { code: 'OHADA_SPECIAL' } });
    const urgencyParent = await repository.findOne({ where: { code: 'URGENCY' } });
    const appealParent = await repository.findOne({ where: { code: 'APPEAL_REMEDIES' } });
    const enforcementParent = await repository.findOne({ where: { code: 'ENFORCEMENT' } });
    const adminParent = await repository.findOne({ where: { code: 'ADMINISTRATIVE' } });
    const criminalParent = await repository.findOne({ where: { code: 'CRIMINAL' } });
    const commercialParent = await repository.findOne({ where: { code: 'COMMERCIAL_OHADA' } });
    const customaryParent = await repository.findOne({ where: { code: 'CUSTOMARY' } });

    const procedureSubtypes = [
      // Sous-types Procédure Civile Ordinaire
      {
        name: 'Contentieux civil - Procédure ordinaire',
        code: 'CIVIL_CONTENTIOUS',
        description: 'Procédure civile standard devant le tribunal judiciaire avec toutes les étapes',
        required_documents: ['assignation', 'conclusions', 'pieces', 'dossier_plaidoirie'],
        average_duration: 180,
        specific_jurisdictions: ['Tribunal Judiciaire', 'Cour d\'Appel', 'Cour Suprême'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 1
      },
      {
        name: 'Divorce contentieux',
        code: 'DIVORCE_CONTENTIOUS',
        description: 'Procédure de divorce conflictuelle avec phase de conciliation obligatoire',
        required_documents: ['requete_conciliation', 'assignation_divorce', 'conclusions'],
        average_duration: 120,
        specific_jurisdictions: ['Juge aux Affaires Familiales', 'Cour d\'Appel'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 2
      },
      {
        name: 'Divorce sur requête conjointe (amiable)',
        code: 'DIVORCE_JOINT',
        description: 'Divorce par consentement mutuel avec homologation',
        required_documents: ['convention_divorce', 'requete_conjointe', 'jugement_homologation'],
        average_duration: 30,
        specific_jurisdictions: ['Juge aux Affaires Familiales'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 3
      },
      {
        name: 'Succession & Partage judiciaire',
        code: 'SUCCESSION_SHARING',
        description: 'Procédure de succession et partage judiciaire',
        required_documents: ['acte_notarie', 'inventaire', 'projet_partage'],
        average_duration: 240,
        specific_jurisdictions: ['Tribunal Judiciaire', 'Juge de la Mise en État'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 4
      },
      {
        name: 'Litige immobilier & Foncier',
        code: 'REAL_ESTATE',
        description: 'Litiges immobiliers, expulsion, bornage, revendication',
        required_documents: ['titre_propriete', 'bail', 'commandement_quitter'],
        average_duration: 150,
        specific_jurisdictions: ['Tribunal Judiciaire', 'Juge de l\'Exécution'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 5
      },
      {
        name: 'Responsabilité civile & Dommages-intérêts',
        code: 'CIVIL_LIABILITY',
        description: 'Actions en responsabilité contractuelle ou délictuelle',
        required_documents: ['contrat', 'prejudice', 'expertise'],
        average_duration: 200,
        specific_jurisdictions: ['Tribunal Judiciaire'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 6
      },
      {
        name: 'Filiation, Autorité parentale & Adoption',
        code: 'FAMILY_FILIATION',
        description: 'Procédures relatives à la filiation et l\'autorité parentale',
        required_documents: ['acte_naissance', 'certificat_medical', 'enquete_sociale'],
        average_duration: 90,
        specific_jurisdictions: ['Juge aux Affaires Familiales'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 7
      },
      {
        name: 'Tutelle, Curatelle & Protection des incapables',
        code: 'GUARDIANSHIP',
        description: 'Protection juridique des majeurs et mineurs',
        required_documents: ['certificat_medical', 'requete_ouverture', 'enquete'],
        average_duration: 60,
        specific_jurisdictions: ['Juge des Tutelles'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: civilParent?.id,
        order: 8
      },

      // Sous-types Procédure Spéciale OHADA
      {
        name: 'Injonction de payer & Injonction de faire',
        code: 'OHADA_INJUNCTION',
        description: 'Procédure accélérée pour créances liquides et exigibles',
        required_documents: ['requete_injonction', 'contrat', 'releve_compte'],
        average_duration: 30,
        specific_jurisdictions: ['Président du Tribunal de Commerce'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: ohadaParent?.id,
        order: 1
      },
      {
        name: 'Saisies conservatoires & Mesures conservatoires',
        code: 'OHADA_CONSERVATORY',
        description: 'Mesures avant jugement pour préserver les droits du créancier',
        required_documents: ['requete_autorisation', 'ordonnance', 'acte_saisie'],
        average_duration: 7,
        specific_jurisdictions: ['Président du Tribunal de Commerce'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: ohadaParent?.id,
        order: 2
      },
      {
        name: 'Saisie-attribution / Saisie-vente / Exécution forcée',
        code: 'OHADA_ENFORCEMENT',
        description: 'Exécution forcée OHADA après titre exécutoire',
        required_documents: ['titre_executoire', 'commandement', 'proces_verbal_saisie'],
        average_duration: 45,
        specific_jurisdictions: ['Tribunal de Commerce', 'Juge de l\'Exécution'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: ohadaParent?.id,
        order: 3
      },

      // Sous-types Procédure d'Urgence
      {
        name: 'Référé (toutes formes)',
        code: 'URGENCY_REFEREE',
        description: 'Procédure accélérée pour situations d\'urgence',
        required_documents: ['assignation_refere', 'conclusions_urgence', 'justificatifs_urgence'],
        average_duration: 10,
        specific_jurisdictions: ['Président du Tribunal Judiciaire', 'Président du Tribunal de Commerce'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: urgencyParent?.id,
        order: 1
      },

      // Sous-types Voies de Recours
      {
        name: 'Appel (toutes matières)',
        code: 'APPEAL',
        description: 'Voie de recours ordinaire devant la Cour d\'Appel',
        required_documents: ['declaration_appel', 'conclusions_appel', 'dossier_appel'],
        average_duration: 120,
        specific_jurisdictions: ['Cour d\'Appel'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: appealParent?.id,
        order: 1
      },
      {
        name: 'Pourvoi en cassation & Recours extraordinaires',
        code: 'CASSATION',
        description: 'Recours devant la Cour Suprême pour contrôle de légalité',
        required_documents: ['declaration_pourvoi', 'memoire', 'arret_cour_appel'],
        average_duration: 180,
        specific_jurisdictions: ['Cour Suprême'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: appealParent?.id,
        order: 2
      },

      // Sous-types Exécution des Décisions
      {
        name: 'Exécution forcée & Mesures d\'exécution',
        code: 'ENFORCEMENT_CIVIL',
        description: 'Mise en œuvre forcée des décisions judiciaires',
        required_documents: ['titre_executoire', 'commandement', 'saisie_attribution'],
        average_duration: 60,
        specific_jurisdictions: ['Juge de l\'Exécution'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: enforcementParent?.id,
        order: 1
      },

      // Sous-types Procédure Administrative
      {
        name: 'Contentieux administratif & Fiscal',
        code: 'ADMIN_CONTENTIOUS',
        description: 'Recours contre les actes administratifs',
        required_documents: ['recours_gracieux', 'requete', 'decision_administrative'],
        average_duration: 150,
        specific_jurisdictions: ['Chambre Administrative', 'Cour Suprême'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: adminParent?.id,
        order: 1
      },

      // Sous-types Procédure Pénale
      {
        name: 'Procédure Pénale (Enquête, Instruction, Jugement)',
        code: 'CRIMINAL_PROCEDURE',
        description: 'Procédure pénale complète',
        required_documents: ['plainte', 'citation', 'constitution_partie_civile'],
        average_duration: 90,
        specific_jurisdictions: ['Tribunal Correctionnel', 'Cour d\'Appel', 'Cour Criminelle'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: criminalParent?.id,
        order: 1
      },

      // Sous-types Procédure Commerciale & OHADA
      {
        name: 'Redressement judiciaire & Liquidation des entreprises',
        code: 'COMMERCIAL_REDRESSEMENT',
        description: 'Procédures collectives OHADA',
        required_documents: ['declaration_cessation_paiements', 'bilan', 'liste_créanciers'],
        average_duration: 240,
        specific_jurisdictions: ['Tribunal de Commerce'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: commercialParent?.id,
        order: 1
      },

      // Sous-types Procédure Traditionnelle
      {
        name: 'Justice coutumière & Litiges traditionnels',
        code: 'CUSTOMARY_JUSTICE',
        description: 'Règlement des litiges par l\'autorité traditionnelle',
        required_documents: ['saisine_chef', 'attestation_notables', 'decision_coutumiere'],
        average_duration: 30,
        specific_jurisdictions: ['Tribunal Coutumier', 'Tribunal de Première Instance'],
        is_active: true,
        is_subtype: true,
        hierarchy_level: 2,
        parent_id: customaryParent?.id,
        order: 1
      }
    ];

    for (const subtypeData of procedureSubtypes) {
      const existing = await repository.findOne({
        where: { code: subtypeData.code }
      });

      if (!existing) {
        const subtype = repository.create(subtypeData);
        await repository.save(subtype);
        console.log(`✅ Sous-type de procédure créé: ${subtype.name} (${subtype.code})`);
      } else {
        console.log(`⏩ Sous-type existant: ${existing.name}`);
      }
    }
  }
}