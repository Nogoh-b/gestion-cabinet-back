// src/modules/procedures/seeder/procedure-template.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { Cycle } from '../entities/cycle.entity';
import { StageConfig } from '../entities/stage-config.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';

export default class ProcedureTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const templateRepository = dataSource.getRepository(ProcedureTemplate);
    const stageRepository = dataSource.getRepository(Stage);
    const subStageRepository = dataSource.getRepository(SubStage);
    const transitionRepository = dataSource.getRepository(Transition);
    const cycleRepository = dataSource.getRepository(Cycle);
    const configRepository = dataSource.getRepository(StageConfig);
    const procedureTypeRepository = dataSource.getRepository(ProcedureType);

    // Récupérer tous les sous-types de procédure existants (codes)
    const procedureTypes = await procedureTypeRepository.find();
    const procedureTypeMap = new Map<string, ProcedureType>();
    
    for (const pt of procedureTypes) {
      procedureTypeMap.set(pt.code, pt);
    }

    // Définition de tous les templates avec leur code de procédure associé
    const templatesData = [
      {
        name: 'Contentieux civil - Procédure ordinaire',
        description: 'Procédure civile standard devant le tribunal judiciaire',
        procedureTypeCode: 'CIVIL_CONTENTIOUS',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Décision stratégique', canBeSkipped: false, canBeReentered: true },
          { order: 2, name: 'Phase amiable / Conciliation', canBeSkipped: true, canBeReentered: true },
          { order: 3, name: 'Introduction de l\'instance', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Instruction / Mise en état', canBeSkipped: false, canBeReentered: true },
          { order: 5, name: 'Jugement & Plaidoirie', canBeSkipped: false, canBeReentered: false },
          { order: 6, name: 'Recours (Appel + Cassation)', canBeSkipped: true, canBeReentered: false },
          { order: 7, name: 'Exécution', canBeSkipped: false, canBeReentered: true },
          { order: 8, name: 'Sortie alternative', canBeSkipped: true, canBeReentered: false }
        ],
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Recueil des faits', isMandatory: true },
            { order: 1, name: 'Qualification juridique', isMandatory: true },
            { order: 2, name: 'Veille des délais', isMandatory: true },
            { order: 3, name: 'Analyse des preuves', isMandatory: true },
            { order: 4, name: 'Évaluation des risques', isMandatory: true }
          ],
          'Décision stratégique': [
            { order: 0, name: 'Consultation du client', isMandatory: true },
            { order: 1, name: 'Analyse des options', isMandatory: true },
            { order: 2, name: 'Validation de la stratégie', isMandatory: true }
          ],
          'Introduction de l\'instance': [
            { order: 0, name: 'Rédaction de l\'assignation', isMandatory: true },
            { order: 1, name: 'Choix de la juridiction', isMandatory: true },
            { order: 2, name: 'Vérification des formalités', isMandatory: true },
            { order: 3, name: 'Enrôlement', isMandatory: true },
            { order: 4, name: 'Signification', isMandatory: true }
          ]
        },
        transitions: [
          { from: 'Analyse préalable', to: 'Décision stratégique', type: 'automatic', isDefault: true },
          { from: 'Décision stratégique', to: 'Phase amiable / Conciliation', type: 'manual', label: 'Tenter une conciliation', isDefault: false },
          { from: 'Décision stratégique', to: 'Introduction de l\'instance', type: 'manual', label: 'Engager une procédure', isDefault: true },
          { from: 'Phase amiable / Conciliation', to: 'Introduction de l\'instance', type: 'manual', label: 'Échec de la conciliation', isDefault: true },
          { from: 'Phase amiable / Conciliation', to: 'Sortie alternative', type: 'manual', label: 'Accord trouvé', isDefault: false },
          { from: 'Introduction de l\'instance', to: 'Instruction / Mise en état', type: 'manual', isDefault: true },
          { from: 'Instruction / Mise en état', to: 'Jugement & Plaidoirie', type: 'manual', isDefault: true },
          { from: 'Jugement & Plaidoirie', to: 'Recours (Appel + Cassation)', type: 'manual', label: 'Interjeter appel', isDefault: false },
          { from: 'Jugement & Plaidoirie', to: 'Exécution', type: 'manual', label: 'Exécuter le jugement', isDefault: true },
          { from: 'Recours (Appel + Cassation)', to: 'Exécution', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Divorce contentieux',
        description: 'Procédure de divorce conflictuelle avec phase de conciliation obligatoire',
        procedureTypeCode: 'DIVORCE_CONTENTIOUS',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Requête en conciliation', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Audience de conciliation', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Assignation en divorce', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Instruction', canBeSkipped: false, canBeReentered: true },
          { order: 5, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 6, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 7, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Recueil des faits', isMandatory: true },
            { order: 1, name: 'Qualification juridique', isMandatory: true },
            { order: 2, name: 'Vérification des délais', isMandatory: true }
          ],
          'Instruction': [
            { order: 0, name: 'Échanges de conclusions', isMandatory: true },
            { order: 1, name: 'Production de pièces', isMandatory: true },
            { order: 2, name: 'Mesures d\'instruction', isMandatory: false },
            { order: 3, name: 'Audience de mise en état', isMandatory: true },
            { order: 4, name: 'Clôture', isMandatory: true }
          ]
        },
        transitions: [
          { from: 'Analyse préalable', to: 'Requête en conciliation', type: 'automatic', isDefault: true },
          { from: 'Requête en conciliation', to: 'Audience de conciliation', type: 'manual', isDefault: true },
          { from: 'Audience de conciliation', to: 'Assignation en divorce', type: 'manual', label: 'Échec de la conciliation', isDefault: true },
          { from: 'Assignation en divorce', to: 'Instruction', type: 'manual', isDefault: true },
          { from: 'Instruction', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', label: 'Interjeter appel', isDefault: false },
          { from: 'Jugement', to: 'Exécution', type: 'manual', label: 'Exécuter le jugement', isDefault: true }
        ]
      },
      {
        name: 'Divorce sur requête conjointe (amiable)',
        description: 'Divorce par consentement mutuel avec homologation',
        procedureTypeCode: 'DIVORCE_JOINT',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Rédaction convention', canBeSkipped: false, canBeReentered: true },
          { order: 2, name: 'Dépôt requête conjointe', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Homologation par JAF', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Jugement sans débat', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Recours limité', canBeSkipped: true, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Rédaction convention', type: 'automatic', isDefault: true },
          { from: 'Rédaction convention', to: 'Dépôt requête conjointe', type: 'manual', isDefault: true },
          { from: 'Dépôt requête conjointe', to: 'Homologation par JAF', type: 'manual', isDefault: true },
          { from: 'Homologation par JAF', to: 'Jugement sans débat', type: 'manual', isDefault: true },
          { from: 'Jugement sans débat', to: 'Recours limité', type: 'manual', label: 'Contester le refus', isDefault: false }
        ]
      },
      {
        name: 'Succession & Partage judiciaire',
        description: 'Procédure de succession et partage judiciaire',
        procedureTypeCode: 'SUCCESSION_SHARING',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Ouverture succession', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Inventaire', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Désignation liquidateur', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Partage amiable ou judiciaire', canBeSkipped: false, canBeReentered: true },
          { order: 5, name: 'Homologation', canBeSkipped: false, canBeReentered: false },
          { order: 6, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 7, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Ouverture succession', type: 'automatic', isDefault: true },
          { from: 'Ouverture succession', to: 'Inventaire', type: 'manual', isDefault: true },
          { from: 'Inventaire', to: 'Désignation liquidateur', type: 'manual', isDefault: true },
          { from: 'Désignation liquidateur', to: 'Partage amiable ou judiciaire', type: 'manual', isDefault: true },
          { from: 'Partage amiable ou judiciaire', to: 'Homologation', type: 'manual', isDefault: true },
          { from: 'Homologation', to: 'Recours', type: 'manual', label: 'Contester l\'homologation', isDefault: false },
          { from: 'Homologation', to: 'Exécution', type: 'manual', label: 'Exécuter le partage', isDefault: true }
        ]
      },
      {
        name: 'Litige immobilier & Foncier',
        description: 'Litiges immobiliers, expulsion, bornage, revendication',
        procedureTypeCode: 'REAL_ESTATE',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Mise en demeure', canBeSkipped: true, canBeReentered: false },
          { order: 2, name: 'Assignation', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Instruction', canBeSkipped: false, canBeReentered: true },
          { order: 4, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 6, name: 'Exécution forcée', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Mise en demeure', type: 'manual', label: 'Envoyer mise en demeure', isDefault: false },
          { from: 'Analyse préalable', to: 'Assignation', type: 'manual', label: 'Assigner directement', isDefault: true },
          { from: 'Mise en demeure', to: 'Assignation', type: 'manual', isDefault: true },
          { from: 'Assignation', to: 'Instruction', type: 'manual', isDefault: true },
          { from: 'Instruction', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', label: 'Interjeter appel', isDefault: false },
          { from: 'Jugement', to: 'Exécution forcée', type: 'manual', label: 'Exécuter', isDefault: true }
        ]
      },
      {
        name: 'Responsabilité civile & Dommages-intérêts',
        description: 'Actions en responsabilité contractuelle ou délictuelle',
        procedureTypeCode: 'CIVIL_LIABILITY',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Mise en demeure', canBeSkipped: true, canBeReentered: false },
          { order: 2, name: 'Assignation', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Instruction (expertise)', canBeSkipped: false, canBeReentered: true },
          { order: 4, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 6, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Mise en demeure', type: 'manual', isDefault: false },
          { from: 'Analyse préalable', to: 'Assignation', type: 'manual', isDefault: true },
          { from: 'Mise en demeure', to: 'Assignation', type: 'manual', isDefault: true },
          { from: 'Assignation', to: 'Instruction (expertise)', type: 'manual', isDefault: true },
          { from: 'Instruction (expertise)', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', isDefault: false },
          { from: 'Jugement', to: 'Exécution', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Filiation, Autorité parentale & Adoption',
        description: 'Procédures relatives à la filiation et l\'autorité parentale',
        procedureTypeCode: 'FAMILY_FILIATION',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Assignation / Requête', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Instruction (expertise ADN)', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 5, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Assignation / Requête', type: 'automatic', isDefault: true },
          { from: 'Assignation / Requête', to: 'Instruction (expertise ADN)', type: 'manual', isDefault: true },
          { from: 'Instruction (expertise ADN)', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', isDefault: false },
          { from: 'Jugement', to: 'Exécution', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Tutelle, Curatelle & Protection des incapables',
        description: 'Protection juridique des majeurs et mineurs',
        procedureTypeCode: 'GUARDIANSHIP',
        stages: [
          { order: 0, name: 'Analyse préalable', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Requête ouverture', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Audience chambre du conseil', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Désignation tuteur/curateur', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Homologation', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Recours', canBeSkipped: true, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse préalable', to: 'Requête ouverture', type: 'automatic', isDefault: true },
          { from: 'Requête ouverture', to: 'Audience chambre du conseil', type: 'manual', isDefault: true },
          { from: 'Audience chambre du conseil', to: 'Désignation tuteur/curateur', type: 'manual', isDefault: true },
          { from: 'Désignation tuteur/curateur', to: 'Homologation', type: 'manual', isDefault: true },
          { from: 'Homologation', to: 'Recours', type: 'manual', isDefault: false }
        ]
      },
      {
        name: 'Injonction de payer & Injonction de faire',
        description: 'Procédure accélérée pour créances liquides et exigibles',
        procedureTypeCode: 'OHADA_INJUNCTION',
        stages: [
          { order: 0, name: 'Analyse créance', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Requête', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Ordonnance', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Signification + Opposition', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Procédure au fond (si opposition)', canBeSkipped: true, canBeReentered: false },
          { order: 5, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse créance', to: 'Requête', type: 'automatic', isDefault: true },
          { from: 'Requête', to: 'Ordonnance', type: 'manual', isDefault: true },
          { from: 'Ordonnance', to: 'Signification + Opposition', type: 'manual', isDefault: true },
          { from: 'Signification + Opposition', to: 'Procédure au fond (si opposition)', type: 'manual', label: 'Opposition formée', isDefault: false },
          { from: 'Signification + Opposition', to: 'Exécution', type: 'manual', label: 'Pas d\'opposition', isDefault: true }
        ]
      },
      {
        name: 'Saisies conservatoires & Mesures conservatoires',
        description: 'Mesures avant jugement pour préserver les droits du créancier',
        procedureTypeCode: 'OHADA_CONSERVATORY',
        stages: [
          { order: 0, name: 'Requête autorisation', canBeSkipped: false, canBeReentered: false },
          { order: 1, name: 'Ordonnance Président', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Réalisation saisie', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Transformation en saisie définitive', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Requête autorisation', to: 'Ordonnance Président', type: 'manual', isDefault: true },
          { from: 'Ordonnance Président', to: 'Réalisation saisie', type: 'manual', isDefault: true },
          { from: 'Réalisation saisie', to: 'Transformation en saisie définitive', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Saisie-attribution / Saisie-vente / Exécution forcée',
        description: 'Exécution forcée OHADA après titre exécutoire',
        procedureTypeCode: 'OHADA_ENFORCEMENT',
        stages: [
          { order: 0, name: 'Titre exécutoire', canBeSkipped: false, canBeReentered: false },
          { order: 1, name: 'Commandement', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Saisie', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Vente ou attribution', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Distribution du produit', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Titre exécutoire', to: 'Commandement', type: 'automatic', isDefault: true },
          { from: 'Commandement', to: 'Saisie', type: 'manual', isDefault: true },
          { from: 'Saisie', to: 'Vente ou attribution', type: 'manual', isDefault: true },
          { from: 'Vente ou attribution', to: 'Distribution du produit', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Référé (toutes formes)',
        description: 'Procédure accélérée pour situations d\'urgence',
        procedureTypeCode: 'URGENCY_REFEREE',
        stages: [
          { order: 0, name: 'Analyse urgence', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Assignation en référé', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Audience rapide', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Ordonnance de référé', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Recours limité', canBeSkipped: true, canBeReentered: false },
          { order: 5, name: 'Exécution', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse urgence', to: 'Assignation en référé', type: 'automatic', isDefault: true },
          { from: 'Assignation en référé', to: 'Audience rapide', type: 'manual', isDefault: true },
          { from: 'Audience rapide', to: 'Ordonnance de référé', type: 'manual', isDefault: true },
          { from: 'Ordonnance de référé', to: 'Recours limité', type: 'manual', isDefault: false },
          { from: 'Ordonnance de référé', to: 'Exécution', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Appel (toutes matières)',
        description: 'Voie de recours ordinaire devant la Cour d\'Appel',
        procedureTypeCode: 'APPEAL',
        stages: [
          { order: 0, name: 'Analyse décision', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Déclaration d\'appel', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Instruction en appel', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Audience en appel', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Arrêt de la Cour d\'Appel', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse décision', to: 'Déclaration d\'appel', type: 'automatic', isDefault: true },
          { from: 'Déclaration d\'appel', to: 'Instruction en appel', type: 'manual', isDefault: true },
          { from: 'Instruction en appel', to: 'Audience en appel', type: 'manual', isDefault: true },
          { from: 'Audience en appel', to: 'Arrêt de la Cour d\'Appel', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Pourvoi en cassation & Recours extraordinaires',
        description: 'Recours devant la Cour Suprême pour contrôle de légalité',
        procedureTypeCode: 'CASSATION',
        stages: [
          { order: 0, name: 'Analyse motifs', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Déclaration pourvoi', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Dépôt mémoires', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Examen Chambre de Cassation', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Arrêt Cour Suprême', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse motifs', to: 'Déclaration pourvoi', type: 'automatic', isDefault: true },
          { from: 'Déclaration pourvoi', to: 'Dépôt mémoires', type: 'manual', isDefault: true },
          { from: 'Dépôt mémoires', to: 'Examen Chambre de Cassation', type: 'manual', isDefault: true },
          { from: 'Examen Chambre de Cassation', to: 'Arrêt Cour Suprême', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Exécution forcée & Mesures d\'exécution',
        description: 'Mise en œuvre forcée des décisions judiciaires',
        procedureTypeCode: 'ENFORCEMENT_CIVIL',
        stages: [
          { order: 0, name: 'Titre exécutoire', canBeSkipped: false, canBeReentered: false },
          { order: 1, name: 'Commandement / Mise en demeure', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Saisies diverses', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Gestion incidents (JEX)', canBeSkipped: true, canBeReentered: true },
          { order: 4, name: 'Distribution', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Titre exécutoire', to: 'Commandement / Mise en demeure', type: 'automatic', isDefault: true },
          { from: 'Commandement / Mise en demeure', to: 'Saisies diverses', type: 'manual', isDefault: true },
          { from: 'Saisies diverses', to: 'Gestion incidents (JEX)', type: 'manual', label: 'Incident', isDefault: false },
          { from: 'Saisies diverses', to: 'Distribution', type: 'manual', isDefault: true },
          { from: 'Gestion incidents (JEX)', to: 'Saisies diverses', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Contentieux administratif & Fiscal',
        description: 'Recours contre les actes administratifs',
        procedureTypeCode: 'ADMIN_CONTENTIOUS',
        stages: [
          { order: 0, name: 'Recours gracieux/hiérarchique', canBeSkipped: true, canBeReentered: false },
          { order: 1, name: 'Saisine Chambre Administrative', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Instruction', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Pourvoi en cassation', canBeSkipped: true, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Recours gracieux/hiérarchique', to: 'Saisine Chambre Administrative', type: 'manual', isDefault: true },
          { from: 'Saisine Chambre Administrative', to: 'Instruction', type: 'manual', isDefault: true },
          { from: 'Instruction', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Pourvoi en cassation', type: 'manual', isDefault: false }
        ]
      },
      {
        name: 'Procédure Pénale (Enquête, Instruction, Jugement)',
        description: 'Procédure pénale complète',
        procedureTypeCode: 'CRIMINAL_PROCEDURE',
        stages: [
          { order: 0, name: 'Analyse dossier pénal', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Plainte / Dénonciation', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Enquête / Instruction', canBeSkipped: false, canBeReentered: true },
          { order: 3, name: 'Audience', canBeSkipped: false, canBeReentered: false },
          { order: 4, name: 'Jugement', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Recours', canBeSkipped: true, canBeReentered: false },
          { order: 6, name: 'Exécution peine', canBeSkipped: false, canBeReentered: true }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse dossier pénal', to: 'Plainte / Dénonciation', type: 'automatic', isDefault: true },
          { from: 'Plainte / Dénonciation', to: 'Enquête / Instruction', type: 'manual', isDefault: true },
          { from: 'Enquête / Instruction', to: 'Audience', type: 'manual', isDefault: true },
          { from: 'Audience', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', isDefault: false },
          { from: 'Jugement', to: 'Exécution peine', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Redressement judiciaire & Liquidation des entreprises',
        description: 'Procédures collectives OHADA',
        procedureTypeCode: 'COMMERCIAL_REDRESSEMENT',
        stages: [
          { order: 0, name: 'Analyse situation entreprise', canBeSkipped: false, canBeReentered: true },
          { order: 1, name: 'Déclaration cessation paiements', canBeSkipped: false, canBeReentered: false },
          { order: 2, name: 'Ouverture procédure', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Période d\'observation', canBeSkipped: false, canBeReentered: true },
          { order: 4, name: 'Plan de redressement ou liquidation', canBeSkipped: false, canBeReentered: false },
          { order: 5, name: 'Clôture', canBeSkipped: false, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Analyse situation entreprise', to: 'Déclaration cessation paiements', type: 'automatic', isDefault: true },
          { from: 'Déclaration cessation paiements', to: 'Ouverture procédure', type: 'manual', isDefault: true },
          { from: 'Ouverture procédure', to: 'Période d\'observation', type: 'manual', isDefault: true },
          { from: 'Période d\'observation', to: 'Plan de redressement ou liquidation', type: 'manual', isDefault: true },
          { from: 'Plan de redressement ou liquidation', to: 'Clôture', type: 'manual', isDefault: true }
        ]
      },
      {
        name: 'Justice coutumière & Litiges traditionnels',
        description: 'Règlement des litiges par l\'autorité traditionnelle',
        procedureTypeCode: 'CUSTOMARY_JUSTICE',
        stages: [
          { order: 0, name: 'Saisine autorité traditionnelle', canBeSkipped: false, canBeReentered: false },
          { order: 1, name: 'Conciliation par notables', canBeSkipped: false, canBeReentered: true },
          { order: 2, name: 'Décision coutumière', canBeSkipped: false, canBeReentered: false },
          { order: 3, name: 'Recours tribunal moderne', canBeSkipped: true, canBeReentered: false }
        ],
        subStages: {},
        transitions: [
          { from: 'Saisine autorité traditionnelle', to: 'Conciliation par notables', type: 'manual', isDefault: true },
          { from: 'Conciliation par notables', to: 'Décision coutumière', type: 'manual', isDefault: true },
          { from: 'Décision coutumière', to: 'Recours tribunal moderne', type: 'manual', label: 'Contester la décision', isDefault: false }
        ]
      }
    ];

    const createdTemplates : ProcedureTemplate[]  = [];

    for (const templateData of templatesData) {
      // Vérifier si le template existe déjà
      const existingTemplate = await templateRepository.findOne({
        where: { name: templateData.name }
      });

      let savedTemplate : ProcedureTemplate;
      
      if (existingTemplate) {
        console.log(`⏩ Template existant: ${templateData.name}, mise à jour...`);
        savedTemplate = existingTemplate;
      } else {
        const template = templateRepository.create({
          name: templateData.name,
          description: templateData.description,
          version: 1
        });
        savedTemplate = await templateRepository.save(template);
        console.log(`✅ Template créé: ${savedTemplate.name}`);
      }

      // 🔗 LIER LE TEMPLATE AU PROCEDURE_TYPE
      const procedureType = procedureTypeMap.get(templateData.procedureTypeCode);
      if (procedureType) {
        if (procedureType.procedure_template_id !== savedTemplate.id) {
          await procedureTypeRepository.update(procedureType.id, {
            procedure_template_id: savedTemplate.id
          });
          console.log(`  🔗 Template lié à: ${procedureType.name} (${procedureType.code})`);
        } else {
          console.log(`  🔗 Template déjà lié à: ${procedureType.name}`);
        }
      } else {
        console.log(`  ⚠️ ProcedureType non trouvé pour le code: ${templateData.procedureTypeCode}`);
      }

      // Créer les stages
      const stages: Stage[] = [];
      for (const stageData of templateData.stages) {
        const existingStage = await stageRepository.findOne({
          where: { templateId: savedTemplate.id, name: stageData.name }
        });

        let stage;
        if (existingStage) {
          stage = existingStage;
        } else {
          stage = stageRepository.create({
            ...stageData,
            description: stageData.name,
            templateId: savedTemplate.id
          });
          stage = await stageRepository.save(stage);
        }
        stages.push(stage);
      }
      console.log(`  📍 ${stages.length} stages pour ${savedTemplate.name}`);

      // Créer les sub-stages
      if (templateData.subStages) {
        for (const stage of stages) {
          const subStagesForStage = templateData.subStages[stage.name];
          if (subStagesForStage) {
            for (const subStageData of subStagesForStage) {
              const existingSubStage = await subStageRepository.findOne({
                where: { stageId: stage.id, name: subStageData.name }
              });
              
              if (!existingSubStage) {
                const subStage = subStageRepository.create({
                  ...subStageData,
                  description: subStageData.name,
                  stageId: stage.id
                });
                await subStageRepository.save(subStage);
              }
            }
            console.log(`    📝 Sub-stages créés pour ${stage.name}`);
          }
        }
      }

      // Créer les transitions
      if (templateData.transitions) {
        const getStageByName = (name: string) => stages.find(s => s.name === name);
        
        for (const transData of templateData.transitions) {
          const fromStage = getStageByName(transData.from);
          const toStage = getStageByName(transData.to);

          if (fromStage && toStage) {
            const existingTransition = await transitionRepository.findOne({
              where: {
                fromStageId: fromStage.id,
                toStageId: toStage.id,
                templateId: savedTemplate.id
              }
            });

            if (!existingTransition) {
              const transition = transitionRepository.create({
                fromStageId: fromStage.id,
                toStageId: toStage.id,
                type: transData.type,
                label: transData.label || null,
                isDefault: transData.isDefault,
                requiresDecision: transData.type === 'manual',
                requiresValidation: false,
                templateId: savedTemplate.id,
                expectsUserInput: false,
                userInputs: null,
                preTransitionActions: null,
                postTransitionActions: null,
                onTransition: null
              } as any);
              await transitionRepository.save(transition);
            }
          }
        }
        console.log(`  🔄 ${templateData.transitions.length} transitions créées`);
      }

      createdTemplates.push(savedTemplate);
    }

    console.log(`\n🎉 ${createdTemplates.length} templates créés avec succès !`);
    console.log(`📊 Templates disponibles:`);
    createdTemplates.forEach(t => console.log(`   - ${t.name}`));
    
    // Vérification finale des liaisons
    const linkedProcedureTypes = await procedureTypeRepository.find({
      where: { procedure_template_id: { $not: null } as any }
    });
    console.log(`\n🔗 ${linkedProcedureTypes.length} ProcedureTypes ont un template lié`);
    
    return createdTemplates;
  }
}