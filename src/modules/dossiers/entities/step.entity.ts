// entities/step.entity.ts
import { RecommendationType } from 'src/core/enums/dossier-status.enum';
import { DocumentCustomer, DocumentCustomerStatus } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { DangerLevel, Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { StepAction } from './step-action.entity';
import { Diligence, DiligenceStatus } from 'src/modules/diligence/entities/diligence.entity';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';




export interface StepMetadata {
  // Type d'étape (pour identification)
  stepType?: 'OPENING' | 'AMIABLE' | 'CONTENTIOUS' | 'DECISION' | 'APPEAL' | 'CLOSURE';
  
  // Sous-type (pour plus de précision)
  subType?: 'FIRST_INSTANCE' | 'APPEAL' | 'CASSATION' | 'POSSIBILITY' | 'REMAND';
  
  // Champs communs
  createdAt?: Date;
  completedAt?: Date;
  description?: string;
  
  // Champs spécifiques selon le type
  // Ces champs sont optionnels et dépendent du contexte
  decision?: string;
  court?: string;
  courtLevel?: 'Tribunal' | 'Cour d\'appel' | 'Cour de cassation';
  successProbability?: number;
  dangerLevel?: DangerLevel;
  recommendation?: RecommendationType;
  hearingDate?: Date;
  isSatisfied?: boolean;
  agreementReached?: boolean;
  appealType?: 'APPEAL' | 'CASSATION' | string;
  
  // Champs pour les possibilités de recours
  deadline?: Date| null;
  originalDecision?: string| null;
  originalJudgment?: string| null;
  appealDecision?: string | null;
  
  // Champs pour la cassation
  withRemand?: boolean;
  remandJurisdiction?: string | null;
  cassationOutcome?: 'rejected' | 'accepted_with_remand' | 'accepted_without_remand';
  
  // Champs pour les métriques
  metrics?: {
    totalDocuments?: number;
    validatedDocuments?: number;
    totalDiligences?: number;
    completedDiligences?: number;
    totalAudiences?: number;
    heldAudiences?: number;
    totalFactures?: number;
    paidFactures?: number;
    totalAmount?: number;
  };
  
  // Champs dynamiques (pour extension)
  [key: string]: any;
}



export enum StepType {
  OPENING = 'opening',
  AMIABLE = 'amiable',
  CONTENTIOUS = 'contentious',
  DECISION = 'decision',
  APPEAL = 'appeal',
  CLOSURE = 'closure'
}

export enum StepStatus {
  PENDING = -1,
  IN_PROGRESS = 0,
  COMPLETED = 1,
  CANCELLED = 2
}

@Entity()
export class Step {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: StepType
  })
  type: StepType;

  @Column({
    type: 'int',  // 👈 Changer de 'enum' à 'int'
    default: StepStatus.PENDING
  })
  status: StepStatus;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;
  


  @Column({ name: 'dossier_id', type: 'int', nullable: true })
  dossier_id: number;


  @Column({ type: 'date', nullable: true })
  scheduledDate: Date | null;

  @Column({ type: 'date', nullable: true })
  completedDate: Date;

  @Column('simple-json', { nullable: true })
  metadata: StepMetadata;

  @ManyToOne(() => Dossier, dossier => dossier.steps, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  dossier?: Dossier;

  @ManyToOne(() => User, { nullable: true })
  assignedTo?: User | null;
  // Dans step.entity.ts, ajoutez :
  @OneToMany(() => StepAction, action => action.step)
  actions: StepAction[];

  @ManyToMany(() => DocumentCustomer, document => document.steps)
  @JoinTable({
    name: 'step_documents', // Table de jointure
    joinColumn: { name: 'step_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;



  // NOUVELLES RELATIONS
  @OneToMany(() => Diligence, diligence => diligence.step)
  diligences: Diligence[];

  @OneToMany(() => Audience, audience => audience.step)
  audiences: Audience[];

  @OneToMany(() => Facture, facture => facture.step)
  factures: Facture[];

  // Optionnel: Pour les métriques agrégées
  @Column({ type: 'json', nullable: true })
  metrics: {
    totalDocuments?: number;
    validatedDocuments?: number;
    totalDiligences?: number;
    completedDiligences?: number;
    totalAudiences?: number;
    heldAudiences?: number;
    totalFactures?: number;
    paidFactures?: number;
    totalAmount?: number;
  };

  // Méthodes utilitaires
  get progress(): number {
    const actions = [
      ...(this.documents || []),
      ...(this.diligences || []),
      ...(this.audiences || []),
      ...(this.factures || [])
    ];
    
    if (actions.length === 0) return 0;
    
    const completedActions = actions.filter(action => {
      if (action instanceof DocumentCustomer) {
        return action.status === DocumentCustomerStatus.ACCEPTED;
      }
      if (action instanceof Diligence) {
        return action.status === DiligenceStatus.COMPLETED;
      }
      if (action instanceof Audience) {
        return action.status === AudienceStatus.HELD;
      }
      if (action instanceof Facture) {
        return action.statut_paiement === StatutFacture.PAYEE;
      }
      return false;
    });
    
    return Math.round((completedActions.length / actions.length) * 100);
  }

} 