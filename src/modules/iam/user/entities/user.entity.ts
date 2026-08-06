// user.entity.ts
import { Exclude, Expose } from 'class-transformer';
import { UserRole } from 'src/core/enums/user-role.enum';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';
import { Finding } from 'src/modules/finding/entities/finding.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';


@Entity('user')
@BusinessTable({
  label: 'Utilisateurs',
  description: '  système (avocats, secrétaires, clients, etc.).',
  icon: '👤',
  category: 'iam',
  ignored: true, // 🔒 Sécurité : jamais créer un user via IA (mot de passe, rôles, FK user_role, etc.)
})
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'utilisateur, qui est le même que employée',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, unique: false })
  @BusinessColumn({
    label: 'Nom d\'utilisateur',
    description: 'Identifiant de connexion',
    importance: 'high',
    group: 'authentification'
  })
  username: string;

  @Column({ type: 'tinyint' })
  @BusinessColumn({
    label: 'Statut',
    description: 'BD: 1=Actif, 0=Inactif. En SQL utiliser le nombre.',
    importance: 'medium',
    group: 'état'
  })
  status: number;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email de l\'utilisateur',
    format: 'email',
    importance: 'critical',
    group: 'coordonnées'
  })
  email: string;

  @Column({ length: 100, nullable: true })
  @BusinessColumn({
    label: 'Token FCM',
    description: 'Token pour notifications push',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  fcmToken: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  refreshToken: string | null;

  /** Double authentification (OTP e-mail) activée pour ce compte. */
  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfa_enabled: boolean;

  @Exclude()
  @Column({ type: 'char', length: 60, nullable: true })
  password?: string | null;

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.user)
  roleAssignments: UserRoleAssignment[];

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.AVOCAT
  })
  @BusinessColumn({
    label: 'Rôle',
    description: "BD: 'admin', 'avocat', 'secretaire', 'client', 'stagiaire', 'huissier'.",
    importance: 'critical',
    group: 'authentification'
  })
  role: UserRole;

  @OneToOne(() => Employee, (employee) => employee.user, {
    cascade: true,
    eager: true,
  })
  @JoinColumn()
  employee: Employee;

  @Column({ name: 'last_name', length: 45, nullable: false })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom de famille',
    importance: 'critical',
    group: 'identification'
  })
  last_name: string;

  @Column({ name: 'first_name', length: 45, nullable: false })
  @BusinessColumn({
    label: 'Prénom',
    description: 'Prénom',
    importance: 'critical',
    group: 'identification'
  })
  first_name: string;

  @Column({ name: 'is_online', default: true })
  is_online: boolean;

  @Column({
    name: 'lastSeen',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP'
  })
  lastSeen?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  @BusinessColumn({
    label: 'Client associé',
    description: 'Client associé à cet utilisateur (cas des comptes clients)',
    importance: 'medium',
    group: 'relation'
  })
  customer: Customer;


  @OneToMany(() => Dossier, (dossier) => dossier.lawyer)
  managed_dossiers: Dossier[];

  @OneToMany(() => Diligence, (diligence) => diligence.assigned_lawyer)
  assigned_diligences: Diligence[];

  @OneToMany(() => Finding, (finding) => finding.created_by)
  created_findings: Finding[];

  @OneToMany(() => Finding, (finding) => finding.validated_by)
  validated_findings: Finding[];


  @Expose()
  get full_name(): string {
    return `${this.first_name} ${this.last_name}`;
  }

  get specialization(): string | null {
    return this.employee?.specialization || null;
  }
}
