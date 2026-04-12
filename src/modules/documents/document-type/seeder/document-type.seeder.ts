import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { DocumentType, DocumentTypeStatus } from '../entities/document-type.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';

export default class DocumentTypeSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<any> {
    const documentTypeRepository = dataSource.getRepository(DocumentType);
    const categoryRepository = dataSource.getRepository(DocumentCategory);

    // Récupérer toutes les catégories existantes
    const categories = await categoryRepository.find();
    const categoryMap = new Map(categories.map(cat => [cat.code, cat]));

    console.log(`📁 ${categories.length} catégories trouvées`);

    const documentTypes = [
      // ==================== ACTE AUTHENTIQUE ====================
      {
        code: 'ACTE_AUTHENTIQUE',
        name: 'Acte authentique',
        description: 'Rédigé par officier public (notaire, huissier, greffier, officier d\'état civil). Force probante très forte + force exécutoire.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '20971520',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['REAL_ESTATE', 'CONTRACT_COMPLEX', 'GOVERNANCE_BOARD', 'ARCHIVE_PERMANENT'],
      },
      {
        code: 'ACTE_VENTE_IMMOBILIERE',
        name: 'Acte de vente immobilière',
        description: 'Acte authentique de vente immobilière',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '20971520',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['REAL_ESTATE'],
      },
      {
        code: 'HYPOTHEQUE',
        name: 'Hypothèque',
        description: 'Acte authentique d\'hypothèque',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '20971520',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['REAL_ESTATE'],
      },
      {
        code: 'TESTAMENT_AUTHENTIQUE',
        name: 'Testament authentique',
        description: 'Testament reçu par notaire',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['ARCHIVE_PERMANENT'],
      },

      // ==================== ACTE SOUS SEING PRIVÉ ====================
      {
        code: 'ACTE_SOUS_SEING_PRIVE',
        name: 'Acte sous seing privé',
        description: 'Rédigé par les parties sans officier public. Force probante moyenne (entre parties).',
        validityDuration: null,
        mimetype: 'application/pdf,application/msword,image/jpeg',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['CONTRACT_BASIC', 'CONTRACT_COMPLEX', 'HR_CONTRACTS', 'CONTRACT_AMENDMENT', 'CONFIDENTIALITY_NDA'],
      },
      {
        code: 'CONTRAT_VENTE_SSP',
        name: 'Contrat de vente sous seing privé',
        description: 'Contrat de vente entre particuliers',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['CONTRACT_BASIC'],
      },
      {
        code: 'BAIL_SSP',
        name: 'Bail sous seing privé',
        description: 'Contrat de location entre particuliers',
        validityDuration: 36,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['CONTRACT_BASIC'],
      },
      {
        code: 'CONTRAT_TRAVAIL_SSP',
        name: 'Contrat de travail',
        description: 'CDI ou CDD sous seing privé',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['HR_CONTRACTS'],
      },
      {
        code: 'NDA_SSP',
        name: 'Accord de confidentialité (NDA)',
        description: 'Non-Disclosure Agreement sous seing privé',
        validityDuration: 60,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['CONFIDENTIALITY_NDA'],
      },

      // ==================== ACTE D'AVOCAT ====================
      {
        code: 'ACTE_AVOCAT',
        name: 'Acte d\'avocat',
        description: 'Rédigé et contresigné par avocat. Force probante renforcée.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['CONTRACT_COMPLEX', 'LITIGATION_SETTLEMENT'],
      },
      {
        code: 'PROTOCOLE_TRANSACTIONNEL',
        name: 'Protocole transactionnel',
        description: 'Transaction signée par avocats',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_SETTLEMENT'],
      },

      // ==================== JUGEMENT / ARRÊT / ORDONNANCE ====================
      {
        code: 'JUGEMENT_ARRET_ORDONNANCE',
        name: 'Jugement / Arrêt / Ordonnance',
        description: 'Décision de justice. Autorité de la chose jugée + force exécutoire.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['JUDGMENTS', 'APPEALS', 'LITIGATION_INITIATION'],
      },
      {
        code: 'JUGEMENT_TRIBUNAL',
        name: 'Jugement de tribunal',
        description: 'Décision rendue par un tribunal de première instance',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['JUDGMENTS'],
      },
      {
        code: 'ARRET_COUR_APPEL',
        name: 'Arrêt de cour d\'appel',
        description: 'Décision rendue par une cour d\'appel',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['APPEALS'],
      },

      // ==================== PIÈCE DE PROCÉDURE ====================
      {
        code: 'PIECE_PROCEDURE',
        name: 'Pièce de procédure',
        description: 'Document déposé dans un procès. Force probante variable.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_INITIATION', 'LITIGATION_MOTIONS', 'APPEALS'],
      },
      {
        code: 'ASSIGNATION',
        name: 'Assignation',
        description: 'Acte introductif d\'instance',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_INITIATION'],
      },
      {
        code: 'CONCLUSIONS',
        name: 'Conclusions',
        description: 'Conclusions d\'avocat',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_MOTIONS'],
      },
      {
        code: 'APPEL',
        name: 'Déclaration d\'appel',
        description: 'Acte de saisine de la cour d\'appel',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['APPEALS'],
      },

      // ==================== PROCÈS-VERBAL ====================
      {
        code: 'PROCES_VERBAL',
        name: 'Procès-verbal',
        description: 'Constat officiel. Force probante forte.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['GOVERNANCE_BOARD', 'EVIDENCE_TESTIMONIAL', 'HR_DISCIPLINARY'],
      },
      {
        code: 'PV_AG',
        name: 'Procès-verbal d\'Assemblée Générale',
        description: 'PV d\'AG ordinaire ou extraordinaire',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '20971520',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['GOVERNANCE_BOARD'],
      },
      {
        code: 'PV_AUDITION',
        name: 'Procès-verbal d\'audition',
        description: 'PV d\'audition de témoin',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_TESTIMONIAL'],
      },
      {
        code: 'CONSTAT_HUISSIER',
        name: 'Constat d\'huissier',
        description: 'Procès-verbal de constat par huissier',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '20971520',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_TESTIMONIAL'],
      },
      {
        code: 'PV_DISCIPLINAIRE',
        name: 'Procès-verbal disciplinaire',
        description: 'PV d\'entretien disciplinaire',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['HR_DISCIPLINARY'],
      },

      // ==================== DOCUMENT ADMINISTRATIF ====================
      {
        code: 'DOCUMENT_ADMINISTRATIF',
        name: 'Document administratif',
        description: 'Émis par une autorité administrative. Force probante variable (recours possible).',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LICENSES_PERMITS', 'REGULATORY_COMPLIANCE', 'GOVERNMENT_CORRESPONDENCE'],
      },
      {
        code: 'PERMIS_CONSTRUIRE',
        name: 'Permis de construire',
        description: 'Autorisation administrative de construire',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LICENSES_PERMITS'],
      },
      {
        code: 'AGREMENT',
        name: 'Agrément administratif',
        description: 'Autorisation d\'exercer une activité réglementée',
        validityDuration: 60,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LICENSES_PERMITS'],
      },

      // ==================== RAPPORT D'EXPERTISE ====================
      {
        code: 'RAPPORT_EXPERTISE',
        name: 'Rapport d\'expertise',
        description: 'Expertise judiciaire ou amiable. Force probante variable selon nomination.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '52428800',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_EXPERT', 'TECHNICAL_REPORTS', 'TECHNICAL_INSPECTION'],
      },
      {
        code: 'RAPPORT_EXPERT_JUDICIAIRE',
        name: 'Rapport d\'expert judiciaire',
        description: 'Rapport d\'expert désigné par le tribunal',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '52428800',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_EXPERT'],
      },

      // ==================== ACTE D'ÉTAT CIVIL ====================
      {
        code: 'ACTE_ETAT_CIVIL',
        name: 'Acte d\'état civil',
        description: 'Établi par officier d\'état civil. Preuve absolue.',
        validityDuration: null,
        mimetype: 'application/pdf,image/jpeg',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['ARCHIVE_PERMANENT'],
      },
      {
        code: 'ACTE_NAISSANCE',
        name: 'Acte de naissance',
        description: 'Extrait d\'acte de naissance',
        validityDuration: null,
        mimetype: 'application/pdf,image/jpeg',
        max_size: '5242880',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['ARCHIVE_PERMANENT'],
      },
      {
        code: 'ACTE_MARIAGE',
        name: 'Acte de mariage',
        description: 'Extrait d\'acte de mariage',
        validityDuration: null,
        mimetype: 'application/pdf,image/jpeg',
        max_size: '5242880',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['ARCHIVE_PERMANENT'],
      },

      // ==================== PREUVE ÉLECTRONIQUE QUALIFIÉE ====================
      {
        code: 'PREUVE_ELECTRONIQUE_QUALIFIEE',
        name: 'Preuve électronique qualifiée',
        description: 'Document avec signature électronique qualifiée. Force équivalente à l\'écrit papier.',
        validityDuration: null,
        mimetype: 'application/pdf,message/rfc822',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_DIGITAL'],
      },
      {
        code: 'EMAIL_SIGNATURE_QUALIFIEE',
        name: 'Email avec signature qualifiée',
        description: 'Email signé avec signature électronique qualifiée (eIDAS)',
        validityDuration: null,
        mimetype: 'message/rfc822,application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['EVIDENCE_DIGITAL'],
      },

      // ==================== TRANSACTION / ACCORD TRANSACTIONNEL ====================
      {
        code: 'ACCORD_TRANSACTIONNEL',
        name: 'Transaction / Accord transactionnel',
        description: 'Sous seing privé ou acte d\'avocat. Met fin à un litige.',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_SETTLEMENT'],
      },
      {
        code: 'PROTOCOLE_ACCORD',
        name: 'Protocole d\'accord',
        description: 'Protocole d\'accord transactionnel',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['LITIGATION_SETTLEMENT'],
      },

      // ==================== DOCUMENT COMPTABLE / FISCAL ====================
      {
        code: 'DOCUMENT_COMPTABLE_FISCAL',
        name: 'Document comptable / fiscal',
        description: 'Documents comptables légaux. Force probante variable.',
        validityDuration: null,
        mimetype: 'application/pdf,text/csv,application/vnd.ms-excel',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['FINANCIAL_INVOICES', 'FINANCIAL_STATEMENTS', 'FINANCIAL_TAX'],
      },
      {
        code: 'FACTURE',
        name: 'Facture',
        description: 'Facture commerciale',
        validityDuration: null,
        mimetype: 'application/pdf,image/jpeg',
        max_size: '5242880',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['FINANCIAL_INVOICES'],
      },
      {
        code: 'BILAN_COMPTABLE',
        name: 'Bilan comptable',
        description: 'Bilan et compte de résultat',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['FINANCIAL_STATEMENTS'],
      },
      {
        code: 'DECLARATION_IMPOT',
        name: 'Déclaration d\'impôt',
        description: 'Déclaration fiscale annuelle',
        validityDuration: null,
        mimetype: 'application/pdf',
        max_size: '10485760',
        isRequired: false,
        status: DocumentTypeStatus.ACCEPTED,
        documentCategoryCodes: ['FINANCIAL_TAX'],
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    // Fonction pour associer un document à ses catégories
    for (const docTypeData of documentTypes) {
      const { documentCategoryCodes: categoryCodes, ...docData } = docTypeData;

      const existing = await documentTypeRepository.findOne({
        where: { code: docTypeData.code },
        relations: ['categories'], // Charger les relations existantes
      });

      if (!existing) {
        const documentType = new DocumentType();
        
        documentType.code = docData.code;
        documentType.name = docData.name;
        documentType.description = docData.description;
        documentType.validityDuration = docData.validityDuration === null ? 0 : docData.validityDuration;
        documentType.mimetype = docData.mimetype;
        documentType.max_size = docData.max_size;
        documentType.isRequired = docData.isRequired;
        documentType.status = docData.status;
        
        // Sauvegarder d'abord le document type
        await documentTypeRepository.save(documentType);
        
        // Associer les catégories (Many-to-Many)
        if (categoryCodes && categoryCodes.length > 0) {
          const categoriesToLink = categoryCodes
            .map(code => categoryMap.get(code))
            .filter(cat => cat !== undefined);
          
          if (categoriesToLink.length > 0) {
            documentType.categories = categoriesToLink;
            await documentTypeRepository.save(documentType);
            console.log(`✅ DocumentType créé: ${documentType.name} avec ${categoriesToLink.length} catégories`);
          } else {
            console.log(`✅ DocumentType créé: ${documentType.name} (aucune catégorie trouvée)`);
          }
        }
        createdCount++;
      } else {
        skippedCount++;
        console.log(`⏭️ DocumentType existe déjà: ${existing.name}`);
      }
    }

    console.log(`\n📊 Résumé: ${createdCount} créés, ${skippedCount} existants, ${documentTypes.length} total`);
  }
}