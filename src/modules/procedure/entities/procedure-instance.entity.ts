// entities/procedure-instance.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  AfterLoad,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { Stage } from './stage.entity';
import { Decision } from './decision.entity';
import { Task } from './task.entity';
import { InstanceStatus } from './enums/instance-status.enum';
import { HistoryEntry } from './history-entry.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Expose } from 'class-transformer';

@Entity('procedure_instances')
export class ProcedureInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @ManyToOne(() => ProcedureTemplate)
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: InstanceStatus, default: InstanceStatus.ACTIVE })
  status: InstanceStatus;

  @Column()
  currentStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'currentStageId' })
  currentStage: Stage;

  @Column({ type: 'json', nullable: true })
  data: any;

  @OneToMany(() => Decision, (decision) => decision.instance, { cascade: true })
  decisions: Decision[];

  @OneToMany(() => HistoryEntry, (history) => history.instance, { cascade: true })
  history: HistoryEntry[];

  @OneToMany(() => Task, (task) => task.instance, { cascade: true })
  tasks: Task[];

  @Column({ type: 'json', nullable: true })
  completedSubStages: string[];

  @Column({ type: 'json', nullable: true })
  cycleUsageCount: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'json', nullable: true })
  subStageMetadata: Record<string, {
    startedAt?: string;
    completedAt?: string;
    notes?: string;
    completedInStage?: string;
    wasPreviousStage?: boolean;
    documentIds?: number[];
    diligenceIds?: number[];
    invoiceIds?: number[];
    audienceIds?: number[];
  }>;

  @ManyToMany(() => DocumentCustomer, (document) => document.procedureInstances)
  @JoinTable({
    name: 'procedure_instance_documents',
    joinColumn: { name: 'procedure_instance_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @UpdateDateColumn()
  updatedAt: Date;

  // ==================== PROPRIÉTÉS CALCULÉES ====================

  /**
   * Nombre total de sous-étapes (toutes étapes confondues)
   */
    @Expose()
    get totalSubStagesCount(): number {
    if (!this.template?.stages) return 0;
    return this.template.stages.reduce((total, stage) => {
      return total + (stage.subStages?.length || 0);
    }, 0);
  }

  /**
   * Nombre total de sous-étapes obligatoires
   */
    @Expose()
    get totalMandatorySubStagesCount(): number {
    if (!this.template?.stages) return 0;
    return this.template.stages.reduce((total, stage) => {
      return total + (stage.subStages?.filter(ss => ss.isMandatory)?.length || 0);
    }, 0);
  }

  /**
   * Nombre de sous-étapes complétées
   */
    @Expose()
    get completedSubStagesCount(): number {
    return this.completedSubStages?.length || 0;
  }

  /**
   * Nombre de sous-étapes obligatoires complétées
   */
    @Expose()
    get completedMandatorySubStagesCount(): number {
    if (!this.template?.stages) return 0;
    const mandatorySubStageIds = this.template.stages.flatMap(stage =>
      stage.subStages?.filter(ss => ss.isMandatory).map(ss => ss.id) || []
    );
    return mandatorySubStageIds.filter(id => this.completedSubStages?.includes(id)).length;
  }

  /**
   * Nombre de sous-étapes restantes
   */
    @Expose()
    get remainingSubStagesCount(): number {
    return this.totalSubStagesCount - this.completedSubStagesCount;
  }

  /**
   * Nombre de sous-étapes obligatoires restantes
   */
    @Expose()
    get remainingMandatorySubStagesCount(): number {
    return this.totalMandatorySubStagesCount - this.completedMandatorySubStagesCount;
  }

  /**
  * Nombre total de sous-étapes à compléter
  * Compte toutes les sous-étapes (obligatoires + optionnelles) des étapes courantes et futures
  * Pour les étapes passées, ne compte que les sous-étapes obligatoires
  */
  @Expose()
  get totalSubStagesToCompleteCount(): number {
    if (!this.template?.stages) return 0;
    
    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const currentStageIndex = sortedStages.findIndex(stage => stage.id === this.currentStageId);
    
    let total = 0;
    
    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const stageSubStages = stage.subStages || [];
      
      if (i < currentStageIndex) {
        // Étape passée : compter uniquement les sous-étapes obligatoires
        total += stageSubStages.filter(ss => ss.isMandatory).length;
      } else {
        // Étape courante ou future : compter toutes les sous-étapes
        total += stageSubStages.length;
      }
    }
    
    return total;
  }

  /**
  * Nombre de sous-étapes complétées
  * - Étapes passées : toutes les sous-étapes obligatoires sont considérées comme complétées
  * - Étape courante : compter les sous-étapes réellement complétées
  * - Étapes futures : aucune complétée
  */
  @Expose()
  get completedSubStagesToCompleteCount(): number {
    if (!this.template?.stages) return 0;
    
    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const currentStageIndex = sortedStages.findIndex(stage => stage.id === this.currentStageId);
    
    let completed = 0;
    
    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const stageSubStages = stage.subStages || [];
      
      if (i < currentStageIndex) {
        // Étape passée : toutes les sous-étapes obligatoires sont complétées
        completed += stageSubStages.filter(ss => ss.isMandatory).length;
      } else if (i === currentStageIndex) {
        // Étape courante : compter les sous-étapes réellement complétées
        completed += stageSubStages.filter(ss => 
          this.completedSubStages?.includes(ss.id)
        ).length;
      }
      // Étapes futures : aucune complétée
    }
    
    return completed;
  }

  /**
  * Pourcentage de progression global basé sur la même logique
  */
  @Expose()
  get progressPercentage(): number {
    const total = this.totalSubStagesToCompleteCount;
    if (total === 0) return 100;
    return Math.round((this.completedSubStagesToCompleteCount / total) * 100);
  }

  /**
   * Vérifie si l'étape courante est terminée (toutes ses sous-étapes obligatoires sont complétées)
   */
    @Expose()
    get isCurrentStageCompleted(): boolean {
    if (!this.currentStage?.subStages) return false;
    
    const mandatorySubStagesInCurrentStage = this.currentStage.subStages.filter(ss => ss.isMandatory);
    
    if (mandatorySubStagesInCurrentStage.length === 0) return true;
    
    return mandatorySubStagesInCurrentStage.every(ss =>
      this.completedSubStages?.includes(ss.id)
    );
  }

  /**
   * Vérifie si toutes les sous-étapes obligatoires sont complétées
   */
    @Expose()
    get areAllMandatorySubStagesCompleted(): boolean {
    return this.remainingMandatorySubStagesCount === 0;
  }

  /**
   * Vérifie si l'instance est complètement terminée
   * Condition: toutes les sous-étapes obligatoires sont complétées
   * ET (l'étape courante est terminée OU c'est la dernière étape)
   */
    @Expose()
    get isFullyCompleted(): boolean {
    if (!this.areAllMandatorySubStagesCompleted) return false;
    
    // Si toutes les sous-étapes obligatoires sont complétées, l'instance est considérée comme terminée
    // Même si certaines sous-étapes optionnelles ne le sont pas
    return true;
  }

  /**
   * Vérifie si l'instance est à la dernière étape
   */
    @Expose()
    get isOnLastStage(): boolean {
    if (!this.template?.stages || !this.currentStage) return false;
    
    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const lastStage = sortedStages[sortedStages.length - 1];
    
    return this.currentStageId === lastStage?.id;
  }

  /**
   * Vérifie si toutes les sous-étapes (y compris optionnelles) de l'étape courante sont complétées
   */
    @Expose()
    get areAllCurrentStageSubStagesCompleted(): boolean {
    if (!this.currentStage?.subStages) return false;
    
    return this.currentStage.subStages.every(ss =>
      this.completedSubStages?.includes(ss.id)
    );
  }

  /**
   * Obtient les informations de progression de l'étape courante
   */
    @Expose()
    get currentStageProgress(): {
    total: number;
    completed: number;
    mandatoryTotal: number;
    mandatoryCompleted: number;
    percentage: number;
  } {
    if (!this.currentStage?.subStages) {
      return { total: 0, completed: 0, mandatoryTotal: 0, mandatoryCompleted: 0, percentage: 0 };
    }
    
    const allSubStages = this.currentStage.subStages;
    const mandatorySubStages = allSubStages.filter(ss => ss.isMandatory);
    
    const completedAll = allSubStages.filter(ss => this.completedSubStages?.includes(ss.id)).length;
    const completedMandatory = mandatorySubStages.filter(ss => this.completedSubStages?.includes(ss.id)).length;
    
    return {
      total: allSubStages.length,
      completed: completedAll,
      mandatoryTotal: mandatorySubStages.length,
      mandatoryCompleted: completedMandatory,
      percentage: mandatorySubStages.length > 0 
        ? Math.round((completedMandatory / mandatorySubStages.length) * 100)
        : 100
    };
  }

  /**
   * Obtient la liste des sous-étapes obligatoires restantes
   */
    @Expose()
    get remainingMandatorySubStages(): Array<{ stageName: string; subStageName: string; subStageId: string }> {
    if (!this.template?.stages) return [];
    
    const remaining: Array<{ stageName: string; subStageName: string; subStageId: string }> = [];
    
    for (const stage of this.template.stages) {
      const mandatorySubStages = stage.subStages?.filter(ss => ss.isMandatory) || [];
      for (const subStage of mandatorySubStages) {
        if (!this.completedSubStages?.includes(subStage.id)) {
          remaining.push({
            stageName: stage.name,
            subStageName: subStage.name,
            subStageId: subStage.id
          });
        }
      }
    }
    
    return remaining;
  }

  /**
   * Vérifie si l'instance peut être terminée
   */
    @Expose()
    get canBeCompleted(): boolean {
    return this.areAllMandatorySubStagesCompleted && this.status === InstanceStatus.ACTIVE;
  }

  /**
   * Calcule le nombre d'étapes traversées (basé sur les décisions)
   */
    @Expose()
    get stagesTraversedCount(): number {
    if (!this.decisions) return 0;
    // Compter les décisions uniques qui ont changé d'étape
    const uniqueFromStages = new Set(this.decisions.map(d => d.fromStageId));
    return uniqueFromStages.size + 1; // +1 pour l'étape courante
  }

  /**
   * Calcule le temps total passé dans le workflow (en jours)
   */
    @Expose()
    get totalDurationInDays(): number | null {
    if (!this.createdAt) return null;
    const endDate = this.completedAt || new Date();
    const diffTime = Math.abs(endDate.getTime() - this.createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Date de complétion (déduite du statut)
   */
    @Expose()
    get completedAt(): Date | null {
    if (this.status === InstanceStatus.COMPLETED && this.updatedAt) {
      return this.updatedAt;
    }
    return null;
  }

  // Hook pour initialiser les propriétés après le chargement
  @AfterLoad()
  afterLoad() {
    // S'assurer que completedSubStages est toujours un tableau
    if (!this.completedSubStages) {
      this.completedSubStages = [];
    }
    
    // S'assurer que cycleUsageCount est toujours un objet
    if (!this.cycleUsageCount) {
      this.cycleUsageCount = {};
    }
    
    // S'assurer que subStageMetadata est toujours un objet
    if (!this.subStageMetadata) {
      this.subStageMetadata = {};
    }
  }
}