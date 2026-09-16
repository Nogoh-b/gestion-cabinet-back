// activities-user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TenantEntity } from 'src/core/entities/tenant.entity';

/**
 * Journal d'audit : une ligne par action significative (mutation) effectuée par
 * un utilisateur. Alimenté automatiquement par l'AuditInterceptor.
 */
@Entity('activities_user')
@Index('IDX_activities_tenant_date', ['tenant_id', 'created_at'])
@Index('IDX_activities_tenant_risk_date', ['tenant_id', 'risk_level', 'created_at'])
export class ActivitiesUser extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'type_activities_user', length: 45 })
  typeActivities: string;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ── Champs d'audit (alimentés par l'intercepteur, tous nullable) ───────────

	  /** Action : create | update | delete (dérivée de la méthode HTTP). */
	  @Column({ name: 'action', type: 'varchar', length: 20, nullable: true })
	  action: string | null;

	  /** Ressource concernée (1er segment de route, ex: dossiers, audiences). */
	  @Column({ name: 'resource', type: 'varchar', length: 80, nullable: true })
	  resource: string | null;

	  /** Identifiant de la ressource visée, si connu. */
	  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true }) 
	  resource_id: string | null;

  /** Nom métier affichable de la ressource, sans identifiant technique. */
  @Column({ name: 'resource_name', type: 'varchar', length: 255, nullable: true })
  resource_name: string | null;

  /** Route de l'interface permettant d'ouvrir la ressource concernée. */
  @Column({ name: 'resource_url', type: 'varchar', length: 500, nullable: true })
  resource_url: string | null;

  /** Informations lisibles complémentaires (champs modifiés, téléchargement…). */
  @Column({ name: 'event_details', type: 'json', nullable: true })
  event_details: Record<string, unknown> | null;

	  /** Méthode HTTP. */
	  @Column({ name: 'method', type: 'varchar', length: 10, nullable: true })
	  method: string | null;

	  /** Chemin de la requête. */
	  @Column({ name: 'path', type: 'varchar', length: 255, nullable: true })
	  path: string | null;

	  /** Code de statut HTTP de la réponse. */
	  @Column({ name: 'status_code', type: 'int', nullable: true })
	  status_code: number | null;

	  /** Adresse IP de l'appelant. */
	  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
	  ip: string | null;

	  /** Libellé lisible de l'action. */
	  @Column({ name: 'summary', type: 'varchar', length: 255, nullable: true })
	  summary: string | null;

  /** Décision d'accès au moment exact de l'opération. */
  @Column({ name: 'authorization_result', type: 'varchar', length: 20, nullable: true })
  authorization_result: 'allowed' | 'denied' | 'not_required' | null;

  /** Droits demandés et droits détenus au moment de l'opération (instantané). */
  @Column({ name: 'required_permissions', type: 'json', nullable: true })
  required_permissions: string[] | null;

  @Column({ name: 'granted_permissions', type: 'json', nullable: true })
  granted_permissions: string[] | null;

  /** Classement directement exploitable par la vue « activités à risque ». */
  @Column({ name: 'risk_level', type: 'varchar', length: 20, default: 'none' })
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  error_message: string | null;

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity
}
