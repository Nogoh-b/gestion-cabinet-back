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
          'Phase amiable / Conciliation': [
            { order: 0, name: 'Envoi proposition conciliation', isMandatory: false },
            { order: 1, name: 'Organisation médiation', isMandatory: false },
            { order: 2, name: 'Rédaction accord amiable', isMandatory: false },
            { order: 3, name: 'Signature parties', isMandatory: false }
          ],
          'Introduction de l\'instance': [
            { order: 0, name: 'Rédaction de l\'assignation', isMandatory: true },
            { order: 1, name: 'Choix de la juridiction', isMandatory: true },
            { order: 2, name: 'Vérification des formalités', isMandatory: true },
            { order: 3, name: 'Enrôlement', isMandatory: true },
            { order: 4, name: 'Signification', isMandatory: true }
          ],
          'Instruction / Mise en état': [
            { order: 0, name: 'Échanges conclusions', isMandatory: true },
            { order: 1, name: 'Production pièces', isMandatory: true },
            { order: 2, name: 'Diligences expertise', isMandatory: false },
            { order: 3, name: 'Audience mise en état', isMandatory: true },
            { order: 4, name: 'Ordonnance clôture', isMandatory: true }
          ],
          'Jugement & Plaidoirie': [
            { order: 0, name: 'Préparation plaidoirie', isMandatory: true },
            { order: 1, name: 'Audience plaidoirie', isMandatory: true },
            { order: 2, name: 'Délibéré', isMandatory: true },
            { order: 3, name: 'Prononcé jugement', isMandatory: true }
          ],
          'Recours (Appel + Cassation)': [
            { order: 0, name: 'Analyse motifs appel', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Rédaction conclusions', isMandatory: true },
            { order: 3, name: 'Audience cour appel', isMandatory: true },
            { order: 4, name: 'Arrêt cour appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Obtention titre exécutoire', isMandatory: true },
            { order: 1, name: 'Commandement de payer', isMandatory: false },
            { order: 2, name: 'Mise en œuvre saisie', isMandatory: false },
            { order: 3, name: 'Distribution sommes', isMandatory: false }
          ],
          'Sortie alternative': [
            { order: 0, name: 'Rédaction accord transactionnel', isMandatory: true },
            { order: 1, name: 'Validation parties', isMandatory: true },
            { order: 2, name: 'Homologation tribunal', isMandatory: false }
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
          { from: 'Recours (Appel + Cassation)', to: 'Exécution', type: 'manual', isDefault: true },
          { from: 'Exécution', to: 'Instruction / Mise en état', type: 'manual', label: 'Réouverture pour complément', isDefault: false },
          { from: 'Sortie alternative', to: 'Analyse préalable', type: 'manual', label: 'Nouvelle analyse', isDefault: false },
          { from: 'Décision stratégique', to: 'Analyse préalable', type: 'manual', label: 'Retour analyse', isDefault: false }
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
            { order: 2, name: 'Vérification des délais', isMandatory: true },
            { order: 3, name: 'Évaluation situation financière', isMandatory: true },
            { order: 4, name: 'Situation enfants', isMandatory: true }
          ],
          'Requête en conciliation': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Dépôt au greffe', isMandatory: true },
            { order: 2, name: 'Convocation parties', isMandatory: true }
          ],
          'Audience de conciliation': [
            { order: 0, name: 'Préparation audience', isMandatory: true },
            { order: 1, name: 'Comparution parties', isMandatory: true },
            { order: 2, name: 'Proposition mesures provisoires', isMandatory: true },
            { order: 3, name: 'Procès-verbal conciliation', isMandatory: true }
          ],
          'Assignation en divorce': [
            { order: 0, name: 'Rédaction assignation', isMandatory: true },
            { order: 1, name: 'Signification', isMandatory: true },
            { order: 2, name: 'Enrôlement', isMandatory: true }
          ],
          'Instruction': [
            { order: 0, name: 'Échanges de conclusions', isMandatory: true },
            { order: 1, name: 'Production de pièces', isMandatory: true },
            { order: 2, name: 'Mesures d\'instruction', isMandatory: false },
            { order: 3, name: 'Audience de mise en état', isMandatory: true },
            { order: 4, name: 'Clôture', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Plaidoirie', isMandatory: true },
            { order: 1, name: 'Délibéré', isMandatory: true },
            { order: 2, name: 'Prononcé jugement', isMandatory: true },
            { order: 3, name: 'Notification', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Analyse motifs appel', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Procédure appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Obtention titre exécutoire', isMandatory: true },
            { order: 1, name: 'Liquidation prestations', isMandatory: true },
            { order: 2, name: 'Mise en œuvre saisies', isMandatory: false }
          ]
        },
        transitions: [
          { from: 'Analyse préalable', to: 'Requête en conciliation', type: 'automatic', isDefault: true },
          { from: 'Requête en conciliation', to: 'Audience de conciliation', type: 'manual', isDefault: true },
          { from: 'Audience de conciliation', to: 'Assignation en divorce', type: 'manual', label: 'Échec de la conciliation', isDefault: true },
          { from: 'Assignation en divorce', to: 'Instruction', type: 'manual', isDefault: true },
          { from: 'Instruction', to: 'Jugement', type: 'manual', isDefault: true },
          { from: 'Jugement', to: 'Recours', type: 'manual', label: 'Interjeter appel', isDefault: false },
          { from: 'Jugement', to: 'Exécution', type: 'manual', label: 'Exécuter le jugement', isDefault: true },
          { from: 'Exécution', to: 'Analyse préalable', type: 'manual', label: 'Nouvelle procédure', isDefault: false }
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Rencontre parties', isMandatory: true },
            { order: 1, name: 'Évaluation situation', isMandatory: true },
            { order: 2, name: 'Vérification consentement', isMandatory: true },
            { order: 3, name: 'Information parties', isMandatory: true }
          ],
          'Rédaction convention': [
            { order: 0, name: 'Projet convention', isMandatory: true },
            { order: 1, name: 'Négociations', isMandatory: true },
            { order: 2, name: 'Validation avocats', isMandatory: true },
            { order: 3, name: 'Signature parties', isMandatory: true }
          ],
          'Dépôt requête conjointe': [
            { order: 0, name: 'Préparation requête', isMandatory: true },
            { order: 1, name: 'Annexes requise', isMandatory: true },
            { order: 2, name: 'Dépôt greffe', isMandatory: true }
          ],
          'Homologation par JAF': [
            { order: 0, name: 'Transmission dossier JAF', isMandatory: true },
            { order: 1, name: 'Examen JAF', isMandatory: true },
            { order: 2, name: 'Audience homologation', isMandatory: false },
            { order: 3, name: 'Ordonnance homologation', isMandatory: true }
          ],
          'Jugement sans débat': [
            { order: 0, name: 'Rédaction jugement', isMandatory: true },
            { order: 1, name: 'Prononcé', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Recours limité': [
            { order: 0, name: 'Analyse refus', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Procédure appel limité', isMandatory: true }
          ]
        },
        transitions: [
          { from: 'Analyse préalable', to: 'Rédaction convention', type: 'automatic', isDefault: true },
          { from: 'Rédaction convention', to: 'Dépôt requête conjointe', type: 'manual', isDefault: true },
          { from: 'Dépôt requête conjointe', to: 'Homologation par JAF', type: 'manual', isDefault: true },
          { from: 'Homologation par JAF', to: 'Jugement sans débat', type: 'manual', isDefault: true },
          { from: 'Jugement sans débat', to: 'Recours limité', type: 'manual', label: 'Contester le refus', isDefault: false },
          { from: 'Rédaction convention', to: 'Analyse préalable', type: 'manual', label: 'Reprendre analyse', isDefault: false }
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Identification héritiers', isMandatory: true },
            { order: 1, name: 'Recherche testament', isMandatory: true },
            { order: 2, name: 'Évaluation actif/passif', isMandatory: true },
            { order: 3, name: 'Vérification dettes', isMandatory: true }
          ],
          'Ouverture succession': [
            { order: 0, name: 'Déclaration succession', isMandatory: true },
            { order: 1, name: 'Saisine tribunal', isMandatory: true },
            { order: 2, name: 'Ordonnance ouverture', isMandatory: true }
          ],
          'Inventaire': [
            { order: 0, name: 'Liste biens', isMandatory: true },
            { order: 1, name: 'Évaluation biens', isMandatory: true },
            { order: 2, name: 'Recherche créances', isMandatory: true },
            { order: 3, name: 'Rédaction inventaire', isMandatory: true }
          ],
          'Désignation liquidateur': [
            { order: 0, name: 'Proposition liquidateur', isMandatory: true },
            { order: 1, name: 'Acceptation fonction', isMandatory: true },
            { order: 2, name: 'Ordonnance nomination', isMandatory: true }
          ],
          'Partage amiable ou judiciaire': [
            { order: 0, name: 'Projet partage', isMandatory: true },
            { order: 1, name: 'Négociations héritiers', isMandatory: true },
            { order: 2, name: 'Rapport d\'expertise', isMandatory: false },
            { order: 3, name: 'Acte partage', isMandatory: true }
          ],
          'Homologation': [
            { order: 0, name: 'Dépôt acte partage', isMandatory: true },
            { order: 1, name: 'Vérification tribunal', isMandatory: true },
            { order: 2, name: 'Jugement homologation', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Motifs contestation', isMandatory: true },
            { order: 1, name: 'Déclaration recours', isMandatory: true },
            { order: 2, name: 'Procédure appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Attribution lots', isMandatory: true },
            { order: 1, name: 'Publication actes', isMandatory: true },
            { order: 2, name: 'Liquidation droits', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Vérification titres propriété', isMandatory: true },
            { order: 1, name: 'Consultation cadastre', isMandatory: true },
            { order: 2, name: 'Étude règlements', isMandatory: true },
            { order: 3, name: 'Expertise technique', isMandatory: false }
          ],
          'Mise en demeure': [
            { order: 0, name: 'Rédaction mise demeure', isMandatory: true },
            { order: 1, name: 'Notification', isMandatory: true },
            { order: 2, name: 'Délai réponse', isMandatory: true }
          ],
          'Assignation': [
            { order: 0, name: 'Rédaction assignation', isMandatory: true },
            { order: 1, name: 'Signification', isMandatory: true },
            { order: 2, name: 'Enrôlement', isMandatory: true }
          ],
          'Instruction': [
            { order: 0, name: 'Échanges conclusions', isMandatory: true },
            { order: 1, name: 'Production pièces', isMandatory: true },
            { order: 2, name: 'Expertise immobilière', isMandatory: false },
            { order: 3, name: 'Audience mise état', isMandatory: true },
            { order: 4, name: 'Clôture', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Plaidoirie', isMandatory: true },
            { order: 1, name: 'Délibéré', isMandatory: true },
            { order: 2, name: 'Prononcé', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Analyse jugement', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Procédure appel', isMandatory: true }
          ],
          'Exécution forcée': [
            { order: 0, name: 'Commandement quitter lieux', isMandatory: true },
            { order: 1, name: 'Requête force publique', isMandatory: true },
            { order: 2, name: 'Expulsion', isMandatory: true },
            { order: 3, name: 'Saisie biens', isMandatory: false }
          ]
        },
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Recueil preuves', isMandatory: true },
            { order: 1, name: 'Qualification responsabilité', isMandatory: true },
            { order: 2, name: 'Évaluation préjudice', isMandatory: true },
            { order: 3, name: 'Vérification prescription', isMandatory: true }
          ],
          'Mise en demeure': [
            { order: 0, name: 'Rédaction mise demeure', isMandatory: true },
            { order: 1, name: 'Notification', isMandatory: true },
            { order: 2, name: 'Délai réponse', isMandatory: true }
          ],
          'Assignation': [
            { order: 0, name: 'Rédaction assignation', isMandatory: true },
            { order: 1, name: 'Signification', isMandatory: true },
            { order: 2, name: 'Enrôlement', isMandatory: true }
          ],
          'Instruction (expertise)': [
            { order: 0, name: 'Demande expertise', isMandatory: false },
            { order: 1, name: 'Désignation expert', isMandatory: false },
            { order: 2, name: 'Dépôt rapport expertise', isMandatory: false },
            { order: 3, name: 'Contradictions rapport', isMandatory: false },
            { order: 4, name: 'Échanges conclusions', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Plaidoirie', isMandatory: true },
            { order: 1, name: 'Délibéré', isMandatory: true },
            { order: 2, name: 'Prononcé', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Analyse jugement', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Titre exécutoire', isMandatory: true },
            { order: 1, name: 'Commandement payer', isMandatory: true },
            { order: 2, name: 'Saisies', isMandatory: false }
          ]
        },
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Recueil liens familiaux', isMandatory: true },
            { order: 1, name: 'Vérification conditions', isMandatory: true },
            { order: 2, name: 'Recueil consentements', isMandatory: true },
            { order: 3, name: 'Avis parenté', isMandatory: false }
          ],
          'Assignation / Requête': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Dépôt tribunal', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Instruction (expertise ADN)': [
            { order: 0, name: 'Ordonnance expertise', isMandatory: true },
            { order: 1, name: 'Prélèvements', isMandatory: true },
            { order: 2, name: 'Analyse génétique', isMandatory: true },
            { order: 3, name: 'Dépôt rapport', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Audience', isMandatory: true },
            { order: 1, name: 'Délibéré', isMandatory: true },
            { order: 2, name: 'Prononcé', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Motifs appel', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Transcription état civil', isMandatory: true },
            { order: 1, name: 'Notification décision', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse préalable': [
            { order: 0, name: 'Examen médical', isMandatory: true },
            { order: 1, name: 'Entretien famille', isMandatory: true },
            { order: 2, name: 'Évaluation capacité', isMandatory: true },
            { order: 3, name: 'Recherche volonté personne', isMandatory: true }
          ],
          'Requête ouverture': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Annexes médicales', isMandatory: true },
            { order: 2, name: 'Dépôt greffe', isMandatory: true }
          ],
          'Audience chambre du conseil': [
            { order: 0, name: 'Convocation', isMandatory: true },
            { order: 1, name: 'Audition personne', isMandatory: true },
            { order: 2, name: 'Audition famille', isMandatory: true },
            { order: 3, name: 'Décision mesures', isMandatory: true }
          ],
          'Désignation tuteur/curateur': [
            { order: 0, name: 'Proposition candidat', isMandatory: true },
            { order: 1, name: 'Vérification aptitude', isMandatory: true },
            { order: 2, name: 'Acceptation fonction', isMandatory: true }
          ],
          'Homologation': [
            { order: 0, name: 'Rédaction jugement', isMandatory: true },
            { order: 1, name: 'Notification', isMandatory: true },
            { order: 2, name: 'Publicité mesures', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Motifs contestation', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse créance': [
            { order: 0, name: 'Vérification créance', isMandatory: true },
            { order: 1, name: 'Vérification exigibilité', isMandatory: true },
            { order: 2, name: 'Preuves écrites', isMandatory: true },
            { order: 3, name: 'Calcul montant', isMandatory: true }
          ],
          'Requête': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Annexes preuves', isMandatory: true },
            { order: 2, name: 'Dépôt greffe', isMandatory: true }
          ],
          'Ordonnance': [
            { order: 0, name: 'Examen juge', isMandatory: true },
            { order: 1, name: 'Ordonnance rendue', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Signification + Opposition': [
            { order: 0, name: 'Signification ordonnance', isMandatory: true },
            { order: 1, name: 'Délai opposition', isMandatory: true },
            { order: 2, name: 'Traitement opposition', isMandatory: false }
          ],
          'Procédure au fond (si opposition)': [
            { order: 0, name: 'Conversion procédure', isMandatory: true },
            { order: 1, name: 'Assignation', isMandatory: true },
            { order: 2, name: 'Procédure ordinaire', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Titre exécutoire', isMandatory: true },
            { order: 1, name: 'Commandement payer', isMandatory: true },
            { order: 2, name: 'Saisies', isMandatory: false }
          ]
        },
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
        subStages: {
          'Requête autorisation': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Justification urgence', isMandatory: true },
            { order: 2, name: 'Preuve créance', isMandatory: true },
            { order: 3, name: 'Identification biens', isMandatory: true }
          ],
          'Ordonnance Président': [
            { order: 0, name: 'Examen requête', isMandatory: true },
            { order: 1, name: 'Ordonnance rendue', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Réalisation saisie': [
            { order: 0, name: 'Signification ordonnance', isMandatory: true },
            { order: 1, name: 'Acte saisie', isMandatory: true },
            { order: 2, name: 'Inventaire biens', isMandatory: true },
            { order: 3, name: 'Désignation séquestre', isMandatory: false }
          ],
          'Transformation en saisie définitive': [
            { order: 0, name: 'Assignation au fond', isMandatory: true },
            { order: 1, name: 'Jugement validant', isMandatory: true },
            { order: 2, name: 'Transformation saisie', isMandatory: true }
          ]
        },
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
        subStages: {
          'Titre exécutoire': [
            { order: 0, name: 'Vérification titre', isMandatory: true },
            { order: 1, name: 'Calcul créance', isMandatory: true },
            { order: 2, name: 'Vérification prescription', isMandatory: true }
          ],
          'Commandement': [
            { order: 0, name: 'Rédaction commandement', isMandatory: true },
            { order: 1, name: 'Signification', isMandatory: true },
            { order: 2, name: 'Délai opposition', isMandatory: true }
          ],
          'Saisie': [
            { order: 0, name: 'Procès-verbal saisie', isMandatory: true },
            { order: 1, name: 'Inventaire', isMandatory: true },
            { order: 2, name: 'Désignation gardien', isMandatory: false },
            { order: 3, name: 'Publication saisie', isMandatory: true }
          ],
          'Vente ou attribution': [
            { order: 0, name: 'Ordonnance vente', isMandatory: true },
            { order: 1, name: 'Publicité vente', isMandatory: true },
            { order: 2, name: 'Audience vente', isMandatory: true },
            { order: 3, name: 'Adjudication', isMandatory: true }
          ],
          'Distribution du produit': [
            { order: 0, name: 'Consignation fonds', isMandatory: true },
            { order: 1, name: 'Ordre créanciers', isMandatory: true },
            { order: 2, name: 'Distribution', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse urgence': [
            { order: 0, name: 'Caractère urgence', isMandatory: true },
            { order: 1, name: 'Absence contestation sérieuse', isMandatory: true },
            { order: 2, name: 'Mesure provisoire', isMandatory: true }
          ],
          'Assignation en référé': [
            { order: 0, name: 'Rédaction assignation', isMandatory: true },
            { order: 1, name: 'Signification brève', isMandatory: true },
            { order: 2, name: 'Audience fixée', isMandatory: true }
          ],
          'Audience rapide': [
            { order: 0, name: 'Préparation plaidoirie', isMandatory: true },
            { order: 1, name: 'Audience', isMandatory: true },
            { order: 2, name: 'Débats', isMandatory: true }
          ],
          'Ordonnance de référé': [
            { order: 0, name: 'Délibéré', isMandatory: true },
            { order: 1, name: 'Ordonnance rendue', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Recours limité': [
            { order: 0, name: 'Motifs appel', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Procédure appel', isMandatory: true }
          ],
          'Exécution': [
            { order: 0, name: 'Titre exécutoire', isMandatory: true },
            { order: 1, name: 'Exécution provisoire', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse décision': [
            { order: 0, name: 'Étude jugement', isMandatory: true },
            { order: 1, name: 'Identification erreurs', isMandatory: true },
            { order: 2, name: 'Chances succès', isMandatory: true },
            { order: 3, name: 'Délai appel', isMandatory: true }
          ],
          'Déclaration d\'appel': [
            { order: 0, name: 'Rédaction déclaration', isMandatory: true },
            { order: 1, name: 'Dépôt greffe', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Instruction en appel': [
            { order: 0, name: 'Conclusions appelant', isMandatory: true },
            { order: 1, name: 'Conclusions intimé', isMandatory: true },
            { order: 2, name: 'Dépôt pièces', isMandatory: true },
            { order: 3, name: 'Ordonnance clôture', isMandatory: true }
          ],
          'Audience en appel': [
            { order: 0, name: 'Préparation plaidoirie', isMandatory: true },
            { order: 1, name: 'Audience', isMandatory: true },
            { order: 2, name: 'Plaidoiries', isMandatory: true }
          ],
          'Arrêt de la Cour d\'Appel': [
            { order: 0, name: 'Délibéré', isMandatory: true },
            { order: 1, name: 'Prononcé arrêt', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse motifs': [
            { order: 0, name: 'Étude arrêt appel', isMandatory: true },
            { order: 1, name: 'Violation loi', isMandatory: true },
            { order: 2, name: 'Moyens cassation', isMandatory: true },
            { order: 3, name: 'Délai pourvoi', isMandatory: true }
          ],
          'Déclaration pourvoi': [
            { order: 0, name: 'Rédaction déclaration', isMandatory: true },
            { order: 1, name: 'Dépôt greffe', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Dépôt mémoires': [
            { order: 0, name: 'Mémoire demandeur', isMandatory: true },
            { order: 1, name: 'Mémoire défendeur', isMandatory: true },
            { order: 2, name: 'Mémoire en réplique', isMandatory: false }
          ],
          'Examen Chambre de Cassation': [
            { order: 0, name: 'Rapport conseiller', isMandatory: true },
            { order: 1, name: 'Audience', isMandatory: true },
            { order: 2, name: 'Rapport oral', isMandatory: true },
            { order: 3, name: 'Conclusions avocat général', isMandatory: true }
          ],
          'Arrêt Cour Suprême': [
            { order: 0, name: 'Délibéré', isMandatory: true },
            { order: 1, name: 'Prononcé arrêt', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ]
        },
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
        subStages: {
          'Titre exécutoire': [
            { order: 0, name: 'Obtention titre', isMandatory: true },
            { order: 1, name: 'Vérification titre', isMandatory: true },
            { order: 2, name: 'Calcul créance', isMandatory: true }
          ],
          'Commandement / Mise en demeure': [
            { order: 0, name: 'Rédaction commandement', isMandatory: true },
            { order: 1, name: 'Signification', isMandatory: true },
            { order: 2, name: 'Délai paiement', isMandatory: true }
          ],
          'Saisies diverses': [
            { order: 0, name: 'Choix saisie', isMandatory: true },
            { order: 1, name: 'Procès-verbal saisie', isMandatory: true },
            { order: 2, name: 'Inventaire', isMandatory: true },
            { order: 3, name: 'Publication', isMandatory: true }
          ],
          'Gestion incidents (JEX)': [
            { order: 0, name: 'Requête incidents', isMandatory: true },
            { order: 1, name: 'Audience JEX', isMandatory: true },
            { order: 2, name: 'Jugement incidents', isMandatory: true }
          ],
          'Distribution': [
            { order: 0, name: 'Consignation fonds', isMandatory: true },
            { order: 1, name: 'Ordre créanciers', isMandatory: true },
            { order: 2, name: 'Distribution', isMandatory: true }
          ]
        },
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
        subStages: {
          'Recours gracieux/hiérarchique': [
            { order: 0, name: 'Rédaction recours', isMandatory: true },
            { order: 1, name: 'Dépôt autorité', isMandatory: true },
            { order: 2, name: 'Délai réponse', isMandatory: true }
          ],
          'Saisine Chambre Administrative': [
            { order: 0, name: 'Rédaction requête', isMandatory: true },
            { order: 1, name: 'Dépôt greffe', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Instruction': [
            { order: 0, name: 'Mémoires', isMandatory: true },
            { order: 1, name: 'Communication pièces', isMandatory: true },
            { order: 2, name: 'Rapport instruction', isMandatory: true },
            { order: 3, name: 'Audience', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Délibéré', isMandatory: true },
            { order: 1, name: 'Prononcé jugement', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Pourvoi en cassation': [
            { order: 0, name: 'Motifs cassation', isMandatory: true },
            { order: 1, name: 'Déclaration pourvoi', isMandatory: true },
            { order: 2, name: 'Procédure cassation', isMandatory: true }
          ]
        },
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
        subStages: {
          'Analyse dossier pénal': [
            { order: 0, name: 'Étude faits', isMandatory: true },
            { order: 1, name: 'Qualification pénale', isMandatory: true },
            { order: 2, name: 'Vérification prescription', isMandatory: true },
            { order: 3, name: 'Constitution partie civile', isMandatory: false }
          ],
          'Plainte / Dénonciation': [
            { order: 0, name: 'Rédaction plainte', isMandatory: true },
            { order: 1, name: 'Dépôt parquet', isMandatory: true },
            { order: 2, name: 'Réception plainte', isMandatory: true }
          ],
          'Enquête / Instruction': [
            { order: 0, name: 'Ouverture enquête', isMandatory: true },
            { order: 1, name: 'Auditions', isMandatory: true },
            { order: 2, name: 'Perquisitions', isMandatory: false },
            { order: 3, name: 'Expertises', isMandatory: false },
            { order: 4, name: 'Clôture enquête', isMandatory: true }
          ],
          'Audience': [
            { order: 0, name: 'Ordonnance renvoi', isMandatory: true },
            { order: 1, name: 'Préparation défense', isMandatory: true },
            { order: 2, name: 'Audience', isMandatory: true },
            { order: 3, name: 'Plaidoiries', isMandatory: true }
          ],
          'Jugement': [
            { order: 0, name: 'Délibéré', isMandatory: true },
            { order: 1, name: 'Prononcé jugement', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true }
          ],
          'Recours': [
            { order: 0, name: 'Motifs appel', isMandatory: true },
            { order: 1, name: 'Déclaration appel', isMandatory: true },
            { order: 2, name: 'Procédure appel', isMandatory: true }
          ],
          'Exécution peine': [
            { order: 0, name: 'Mandat dépôt', isMandatory: true },
            { order: 1, name: 'Incarcération', isMandatory: false },
            { order: 2, name: 'Aménagement peine', isMandatory: false }
          ]
        },
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
        subStages: {
          'Analyse situation entreprise': [
            { order: 0, name: 'États financiers', isMandatory: true },
            { order: 1, name: 'Dettes', isMandatory: true },
            { order: 2, name: 'Actif', isMandatory: true },
            { order: 3, name: 'Causes difficultés', isMandatory: true }
          ],
          'Déclaration cessation paiements': [
            { order: 0, name: 'Déclaration tribunal', isMandatory: true },
            { order: 1, name: 'Dépôt documents', isMandatory: true },
            { order: 2, name: 'Enregistrement', isMandatory: true }
          ],
          'Ouverture procédure': [
            { order: 0, name: 'Jugement ouverture', isMandatory: true },
            { order: 1, name: 'Nomination mandataire', isMandatory: true },
            { order: 2, name: 'Publication', isMandatory: true }
          ],
          'Période d\'observation': [
            { order: 0, name: 'Déclaration créances', isMandatory: true },
            { order: 1, name: 'Rapport mandataire', isMandatory: true },
            { order: 2, name: 'Proposition plan', isMandatory: true },
            { order: 3, name: 'Négociations', isMandatory: true }
          ],
          'Plan de redressement ou liquidation': [
            { order: 0, name: 'Jugement plan', isMandatory: true },
            { order: 1, name: 'Adoption plan', isMandatory: true },
            { order: 2, name: 'Nomination commissaire', isMandatory: true }
          ],
          'Clôture': [
            { order: 0, name: 'Rapport clôture', isMandatory: true },
            { order: 1, name: 'Jugement clôture', isMandatory: true },
            { order: 2, name: 'Publication', isMandatory: true }
          ]
        },
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
        subStages: {
          'Saisine autorité traditionnelle': [
            { order: 0, name: 'Identification autorité', isMandatory: true },
            { order: 1, name: 'Exposé litige', isMandatory: true },
            { order: 2, name: 'Saisine chef', isMandatory: true }
          ],
          'Conciliation par notables': [
            { order: 0, name: 'Convocation parties', isMandatory: true },
            { order: 1, name: 'Réunion conciliation', isMandatory: true },
            { order: 2, name: 'Proposition solutions', isMandatory: true },
            { order: 3, name: 'Accord', isMandatory: false }
          ],
          'Décision coutumière': [
            { order: 0, name: 'Délibéré notables', isMandatory: true },
            { order: 1, name: 'Rendu décision', isMandatory: true },
            { order: 2, name: 'Notification', isMandatory: true },
            { order: 3, name: 'Exécution coutumière', isMandatory: false }
          ],
          'Recours tribunal moderne': [
            { order: 0, name: 'Motifs recours', isMandatory: true },
            { order: 1, name: 'Saisine tribunal', isMandatory: true },
            { order: 2, name: 'Procédure judiciaire', isMandatory: true }
          ]
        },
        transitions: [
          { from: 'Saisine autorité traditionnelle', to: 'Conciliation par notables', type: 'manual', isDefault: true },
          { from: 'Conciliation par notables', to: 'Décision coutumière', type: 'manual', isDefault: true },
          { from: 'Décision coutumière', to: 'Recours tribunal moderne', type: 'manual', label: 'Contester la décision', isDefault: false }
        ]
      }
    ];

    // Fonction utilitaire pour générer toutes les transitions possibles entre stages
    const generateAllPossibleTransitions = (stages: Stage[], existingTransitions: Set<string>) => {
      const newTransitions: any[] = [];
      
      // Pour chaque paire de stages, créer une transition si elle n'existe pas déjà
      for (let i = 0; i < stages.length; i++) {
        for (let j = 0; j < stages.length; j++) {
          if (i !== j) {
            const transitionKey = `${stages[i].name}|${stages[j].name}`;
            if (!existingTransitions.has(transitionKey)) {
              newTransitions.push({
                from: stages[i].name,
                to: stages[j].name,
                type: 'manual',
                label: `Aller vers ${stages[j].name}`,
                isDefault: false
              });
            }
          }
        }
      }
      
      return newTransitions;
    };

    const createdTemplates: ProcedureTemplate[] = [];

    for (const templateData of templatesData) {
      // Vérifier si le template existe déjà
      let savedTemplate = await templateRepository.findOne({
        where: { name: templateData.name },
        relations: ['stages']
      });

      if (savedTemplate) {
        console.log(`⏩ Template existant: ${templateData.name}, vérification des données...`);
        
        // Vérifier si tous les stages existent
        const existingStageNames = new Set(savedTemplate.stages.map(s => s.name));
        const requiredStageNames = new Set(templateData.stages.map(s => s.name));
        
        // Vérifier s'il manque des stages
        const missingStages = Array.from(requiredStageNames).filter(name => !existingStageNames.has(name));
        
        if (missingStages.length > 0) {
          console.log(`  ⚠️ Stages manquants: ${missingStages.join(', ')} - Mise à jour nécessaire`);
          // On va recréer le template pour avoir la structure complète
          await templateRepository.remove(savedTemplate);
          savedTemplate = null;
        } else {
          console.log(`  ✅ Template existant complet, aucune modification nécessaire`);
        }
      }

      // Créer le template seulement s'il n'existe pas ou a été supprimé
      if (!savedTemplate) {
        const template = templateRepository.create({
          name: templateData.name,
          description: templateData.description,
          version: 1
        });
        savedTemplate = await templateRepository.save(template);
        console.log(`✅ Template créé: ${savedTemplate.name}`);

        // 🔗 LIER LE TEMPLATE AU PROCEDURE_TYPE
        const procedureType = procedureTypeMap.get(templateData.procedureTypeCode);
        if (procedureType) {
          await procedureTypeRepository.update(procedureType.id, {
            procedure_template_id: savedTemplate.id
          });
          console.log(`  🔗 Template lié à: ${procedureType.name} (${procedureType.code})`);
        } else {
          console.log(`  ⚠️ ProcedureType non trouvé pour le code: ${templateData.procedureTypeCode}`);
        }

        // Créer les stages
        const stages: Stage[] = [];
        for (const stageData of templateData.stages) {
          const stage = stageRepository.create({
            ...stageData,
            description: stageData.name,
            templateId: savedTemplate.id
          });
          const savedStage = await stageRepository.save(stage);
          stages.push(savedStage);
        }
        console.log(`  📍 ${stages.length} stages créés pour ${savedTemplate.name}`);

        // Créer les sub-stages
        if (templateData.subStages) {
          for (const stage of stages) {
            const subStagesForStage = templateData.subStages[stage.name];
            if (subStagesForStage) {
              for (const subStageData of subStagesForStage) {
                const subStage = subStageRepository.create({
                  ...subStageData,
                  description: subStageData.name,
                  stageId: stage.id
                });
                await subStageRepository.save(subStage);
              }
              console.log(`    📝 Sub-stages créés pour ${stage.name}`);
            }
          }
        }

        // Créer les transitions
        if (templateData.transitions) {
          const getStageByName = (name: string) => stages.find(s => s.name === name);
          const transitionSet = new Set<string>();
          
          // Ajouter les transitions définies dans le template
          for (const transData of templateData.transitions) {
            const fromStage = getStageByName(transData.from);
            const toStage = getStageByName(transData.to);

            if (fromStage && toStage) {
              const transition = transitionRepository.create({
                fromStageId: fromStage.id,
                toStageId: toStage.id,
                type: transData.type,
                label: (transData as any).label || null,
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
              transitionSet.add(`${transData.from}|${transData.to}`);
            }
          }
          
          // Générer et ajouter les transitions manquantes (aller-retour complet)
          const missingTransitions = generateAllPossibleTransitions(stages, transitionSet);
          for (const transData of missingTransitions) {
            const fromStage = getStageByName(transData.from);
            const toStage = getStageByName(transData.to);
            
            if (fromStage && toStage) {
              const transition = transitionRepository.create({
                fromStageId: fromStage.id,
                toStageId: toStage.id,
                type: transData.type,
                label: transData.label,
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
          
          console.log(`  🔄 ${transitionSet.size + missingTransitions.length} transitions créées (${transitionSet.size} définies + ${missingTransitions.length} complémentaires)`);
        }
      }

      createdTemplates.push(savedTemplate);
    }

    console.log(`\n🎉 ${createdTemplates.length} templates traités avec succès !`);
    console.log(`📊 Templates disponibles:`);
    createdTemplates.forEach(t => console.log(`   - ${t.name} (ID: ${t.id})`));
    
    // Vérification finale des liaisons
    const linkedProcedureTypes = await procedureTypeRepository.find({
      where: { procedure_template_id: { $not: null } as any }
    });
    console.log(`\n🔗 ${linkedProcedureTypes.length} ProcedureTypes ont un template lié`);
    
    // Statistiques des templates
    const allTemplates = await templateRepository.find({ relations: ['stages', 'transitions'] });
    console.log(`\n📊 Statistiques finales:`);
    for (const template of allTemplates) {
      const stageCount = template.stages?.length || 0;
      const transitionCount = template.transitions?.length || 0;
      console.log(`   - ${template.name}: ${stageCount} stages, ${transitionCount} transitions`);
      
      // Vérification que chaque stage a au moins une transition sortante
      const stagesWithoutOutgoingTransitions = template.stages?.filter(stage => {
        return !template.transitions?.some(trans => trans.fromStageId === stage.id);
      }) || [];
      
      if (stagesWithoutOutgoingTransitions.length > 0) {
        console.log(`     ⚠️ Stages sans transition sortante: ${stagesWithoutOutgoingTransitions.map(s => s.name).join(', ')}`);
      }
    }
    
    return createdTemplates;
  }
}