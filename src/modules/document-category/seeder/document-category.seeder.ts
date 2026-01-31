import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';


import { DocumentCategory } from '../entities/document-category.entity';



export default class DocumentCategorySeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(DocumentCategory);

    const categories = [
      {
        code: 'CLIENT',
        name: 'Client',
        description: 'Documents fournis par les clients (pièces d\'identité, contrats, etc.)',
        icon: 'fa-user',
        color: '#3B82F6', // blue
        sort_order: 10,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'confidential' as const, // <-- Correction ici
          requires_validation: true,
          max_file_size_mb: 20,
          retention_period: 3650, // 10 ans
          allowed_mime_types: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ]
        }
      },
      {
        code: 'PROCEDURAL',
        name: 'Procéduraux',
        description: 'Documents liés à la procédure judiciaire (assignations, conclusions, etc.)',
        icon: 'fa-gavel',
        color: '#10B981', // green
        sort_order: 20,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'internal' as const, // <-- Correction ici
          requires_validation: true,
          max_file_size_mb: 50,
          retention_period: 7300, // 20 ans
          allowed_mime_types: ['application/pdf', 'application/msword']
        }
      },
      {
        code: 'LEGAL_RESEARCH',
        name: 'Juridiques',
        description: 'Doctrine, jurisprudence, notes de recherche juridique',
        icon: 'fa-book',
        color: '#8B5CF6', // purple
        sort_order: 30,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'internal' as const,
          requires_validation: false,
          max_file_size_mb: 10,
          retention_period: 1825 // 5 ans
        }
      },
      {
        code: 'CORRESPONDENCE',
        name: 'Correspondance',
        description: 'Échanges de courriers avec les parties, avocats adverses, tribunaux',
        icon: 'fa-envelope',
        color: '#F59E0B', // amber
        sort_order: 40,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'confidential' as const,
          requires_validation: false,
          max_file_size_mb: 10,
          retention_period: 3650 // 10 ans
        }
      },
      {
        code: 'FINANCIAL',
        name: 'Financiers',
        description: 'Factures, reçus, états de frais, honoraires',
        icon: 'fa-money-bill',
        color: '#EF4444', // red
        sort_order: 50,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'confidential' as const,
          requires_validation: true,
          max_file_size_mb: 10,
          retention_period: 7300, // 20 ans
          allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png']
        }
      },
      {
        code: 'CONTRACT',
        name: 'Contrats',
        description: 'Contrats divers, conventions, accords',
        icon: 'fa-file-contract',
        color: '#06B6D4', // cyan
        sort_order: 60,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'confidential' as const,
          requires_validation: true,
          max_file_size_mb: 20,
          retention_period: 10950 // 30 ans
        }
      },
      {
        code: 'ADMINISTRATIVE',
        name: 'Administratif',
        description: 'Documents internes du cabinet, procédures, rapports',
        icon: 'fa-folder',
        color: '#6B7280', // gray
        sort_order: 70,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'internal' as const,
          requires_validation: false,
          max_file_size_mb: 50,
          retention_period: 3650 // 10 ans
        }
      },
      {
        code: 'EXPERT_REPORTS',
        name: 'Expertise',
        description: 'Rapports d\'experts, constats, analyses techniques',
        icon: 'fa-microscope',
        color: '#EC4899', // pink
        sort_order: 80,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'confidential' as const,
          requires_validation: true,
          max_file_size_mb: 100,
          retention_period: 7300 // 20 ans
        }
      },
      {
        code: 'DECISIONS',
        name: 'Justice',
        description: 'Jugements, arrêts, ordonnances',
        icon: 'fa-scale-balanced',
        color: '#8B4513', // brown
        sort_order: 90,
        is_active: true,
        is_system: true,
        metadata: {
          confidentiality_level: 'public' as const, // <-- Correction ici
          requires_validation: false,
          max_file_size_mb: 10,
          retention_period: 0 // Illimité
        }
      },

    ];

    for (const categoryData of categories) {
      const existing = await repository.findOne({
        where: { code: categoryData.code }
      });

      if (!existing) {
        const category = repository.create(categoryData);
        await repository.save(category);
        console.log(`Catégorie créée: ${category.name}`);
      }
    }
  }
}