import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Export ZIP de dossiers conservé sur le serveur (`uploads/exports/<tenant>/`).
 * Il compte dans l'espace alloué au cabinet (StorageUsageService) jusqu'à sa
 * suppression par son auteur ou un administrateur.
 */
@Entity('dossier_exports')
@Index('IDX_dossier_exports_tenant_user', ['tenant_id', 'created_by'])
@BusinessTable({
  label: 'Exports de dossiers',
  description:
    "Archives ZIP de dossiers générées par les utilisateurs et conservées sur le serveur (auteur, dossiers exportés, taille). Elles comptent dans l'espace de stockage du cabinet.",
  icon: '📦',
  category: 'document',
})
export class DossierExport extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant technique',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Exporté par',
    description: "Utilisateur qui a lancé l'export (user.id)",
    importance: 'medium',
    group: 'relation',
  })
  created_by: number | null;

  @Column({ name: 'dossier_ids', type: 'json' })
  @BusinessColumn({
    label: 'Dossiers exportés',
    description: 'Identifiants des dossiers contenus dans le ZIP',
    importance: 'high',
    group: 'identification',
  })
  dossier_ids: number[];

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  @BusinessColumn({
    label: 'Nom du fichier',
    description: 'Nom du ZIP proposé au téléchargement',
    importance: 'medium',
    group: 'stockage',
  })
  file_name: string;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  @BusinessColumn({
    label: 'Chemin',
    description: 'Chemin du ZIP dans uploads/',
    importance: 'low',
    group: 'stockage',
    ignored: true,
  })
  file_path: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
    default: 0,
    transformer: {
      to: (value?: number | null) => value,
      from: (value?: string | number | null) => Number(value ?? 0) || 0,
    },
  })
  @BusinessColumn({
    label: 'Taille',
    description: 'Taille du ZIP en octets',
    importance: 'medium',
    group: 'stockage',
  })
  file_size: number;
}
