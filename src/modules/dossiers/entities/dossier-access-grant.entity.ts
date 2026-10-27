import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

import { Dossier } from './dossier.entity';

/**
 * Autorisation nominative d'accès à un dossier confidentiel.
 *
 * Un dossier confidentiel n'est visible que de l'administration du cabinet.
 * Pour qu'un autre collaborateur y accède, l'administrateur lui accorde
 * explicitement une autorisation ici — y compris s'il est l'avocat
 * responsable ou un collaborateur affecté au dossier : l'affectation
 * métier (`dossier_collaborators`) ne vaut pas droit de lecture.
 *
 * La révocation est tracée (`revoked_at`) plutôt que supprimée, pour garder
 * l'historique des accès accordés.
 */
@Entity('dossier_access_grant')
@Index(['dossier_id', 'employee_id'])
@BusinessTable({
  label: 'Autorisations dossier confidentiel',
  description:
    "Accès nominatif accordé par l'administration à un dossier confidentiel.",
  icon: '🔐',
  category: 'sécurité',
})
export class DossierAccessGrant extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: "Identifiant unique de l'autorisation",
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier confidentiel concerné',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  dossier_id: number;

  @ManyToOne(() => Dossier, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @Column({ type: 'int', name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur autorisé',
    description: "Collaborateur à qui l'accès est accordé",
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  employee_id: number;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'int', nullable: true, name: 'granted_by' })
  @BusinessColumn({
    label: 'Accordée par',
    description: "Administrateur ayant accordé l'accès",
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  granted_by: number;

  @Column({ type: 'datetime', name: 'granted_at', default: () => 'CURRENT_TIMESTAMP' })
  @BusinessColumn({
    label: "Date d'octroi",
    description: "Horodatage de l'octroi",
    format: 'date',
    importance: 'medium',
    group: 'audit',
  })
  granted_at: Date;

  @Column({ type: 'datetime', nullable: true, name: 'revoked_at' })
  @BusinessColumn({
    label: 'Date de révocation',
    description: "Horodatage de la révocation ; vide tant que l'accès est actif",
    format: 'date',
    importance: 'medium',
    group: 'audit',
  })
  revoked_at: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Motif',
    description: "Raison de l'octroi de l'accès",
    importance: 'low',
    group: 'audit',
  })
  reason: string;
}
