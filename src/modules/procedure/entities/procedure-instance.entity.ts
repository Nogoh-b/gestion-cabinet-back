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
import { StageVisit } from './stage-visit.entity';

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

  // ==================== CHAMPS DÉPRÉCIÉS (à migrer puis supprimer) ====================
  /** @deprecated Utiliser stageVisits et subStageVisits à la place */
  @Column({ type: 'json', nullable: true })
  completedSubStages: string[];

  /** @deprecated Utiliser stageVisits et subStageVisits à la place */
  @Column({ type: 'json', nullable: true })
  cycleUsageCount: Record<string, number>;

  /** @deprecated Utiliser stageVisits et subStageVisits à la place */
  @Column({ type: 'json', nullable: true })
  subStageMetadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => StageVisit, (visit) => visit.instance, { cascade: true })
  stageVisits: StageVisit[];

  @ManyToMany(() => DocumentCustomer, (document) => document.procedureInstances)
  @JoinTable({
    name: 'procedure_instance_documents',
    joinColumn: { name: 'procedure_instance_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @UpdateDateColumn()
  updatedAt: Date;

  // ==================== MÉTHODES UTILITAIRES PRIVÉES ====================

  /**
   * Récupère la visite courante de l'étape spécifiée (ou de l'étape courante par défaut)
   */
  private getCurrentStageVisit(stageId?: string): StageVisit | undefined {
    const targetStageId = stageId || this.currentStageId;
    if (!targetStageId) return undefined;

    return this.stageVisits
      ?.filter(v => v.stageId === targetStageId)
      .sort((a, b) => b.visitNumber - a.visitNumber)[0];
  }

  /**
   * Récupère toutes les sous-étapes complétées pour une étape spécifique
   */
  private getCompletedSubStageIdsForStage(stageId: string): Set<string> {
    const completed = new Set<string>();
    const stageVisits = this.stageVisits?.filter(v => v.stageId === stageId) || [];

    for (const visit of stageVisits) {
      if (visit.subStageVisits) {
        for (const subVisit of visit.subStageVisits) {
          if (subVisit.isCompleted) {
            completed.add(subVisit.subStageId);
          }
        }
      }
      // Fallback pour l'ancien champ (pendant la migration)
      if (visit.completedSubStages) {
        visit.completedSubStages.forEach(id => completed.add(id));
      }
    }

    return completed;
  }

  /**
   * Récupère toutes les sous-étapes complétées (toutes étapes confondues)
   */
  private getAllCompletedSubStageIds(): Set<string> {
    const completed = new Set<string>();

    if (this.stageVisits) {
      for (const visit of this.stageVisits) {
        if (visit.subStageVisits) {
          for (const subVisit of visit.subStageVisits) {
            if (subVisit.isCompleted) {
              completed.add(subVisit.subStageId);
            }
          }
        }
        // Fallback
        if (visit.completedSubStages) {
          visit.completedSubStages.forEach(id => completed.add(id));
        }
      }
    }

    // Fallback pour l'ancien champ (pendant la migration)
    if (this.completedSubStages) {
      this.completedSubStages.forEach(id => completed.add(id));
    }

    return completed;
  }

  /**
   * Vérifie si une sous-étape est complétée dans l'étape courante ou dans n'importe quelle visite
   */
  private isSubStageCompleted(subStageId: string, stageId?: string): boolean {
    if (stageId) {
      return this.getCompletedSubStageIdsForStage(stageId).has(subStageId);
    }
    return this.getAllCompletedSubStageIds().has(subStageId);
  }

  /**
   * Récupère la dernière visite pour chaque étape
   */
  private getLastVisitPerStage(): Map<string, StageVisit> {
    const lastVisits = new Map<string, StageVisit>();

    if (!this.stageVisits) return lastVisits;

    for (const visit of this.stageVisits) {
      const existing = lastVisits.get(visit.stageId);
      if (!existing || visit.visitNumber > existing.visitNumber) {
        lastVisits.set(visit.stageId, visit);
      }
    }

    return lastVisits;
  }

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
   * Nombre de sous-étapes complétées (basé sur subStageVisits)
   */
  @Expose()
  get completedSubStagesCount(): number {
    return this.getAllCompletedSubStageIds().size;
  }

  /**
   * Nombre de sous-étapes obligatoires complétées
   */
  @Expose()
  get completedMandatorySubStagesCount(): number {
    if (!this.template?.stages) return 0;
    const completedIds = this.getAllCompletedSubStageIds();
    const mandatorySubStageIds = this.template.stages.flatMap(stage =>
      stage.subStages?.filter(ss => ss.isMandatory).map(ss => ss.id) || []
    );
    return mandatorySubStageIds.filter(id => completedIds.has(id)).length;
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
  const completedIds = this.getAllCompletedSubStageIds();

  let total = 0;

  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const stageSubStages = stage.subStages || [];

    if (i < currentStageIndex) {
      // Étape passée : compter uniquement les sous-étapes OBLIGATOIRES NON ENCORE COMPLÉTÉES
      const mandatoryNotCompleted = stageSubStages.filter(ss => 
        ss.isMandatory && !completedIds.has(ss.id)
      ).length;
      total += mandatoryNotCompleted;
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
    const completedIds = this.getAllCompletedSubStageIds();

    let completed = 0;

    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const stageSubStages = stage.subStages || [];

      if (i < currentStageIndex) {
        // Étape passée : toutes les sous-étapes obligatoires sont complétées
        completed += stageSubStages.filter(ss => ss.isMandatory).length;
      } else if (i === currentStageIndex) {
        // Étape courante : compter les sous-étapes réellement complétées
        completed += stageSubStages.filter(ss => completedIds.has(ss.id)).length;
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
    if (!this.currentStageId || !this.template?.stages) return false;
    
    // Récupérer le stage depuis le template (déjà chargé)
    const currentStageFromTemplate = this.template.stages.find(
      s => s.id === this.currentStageId
    );
    
    if (!currentStageFromTemplate?.subStages) return false;
    
    const completedIds = this.getCompletedSubStageIdsForStage(this.currentStageId);
    const mandatorySubStages = currentStageFromTemplate.subStages.filter(ss => ss.isMandatory);
    
    return mandatorySubStages.every(ss => completedIds.has(ss.id));
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
   */
  @Expose()
  get isFullyCompleted(): boolean {
    if (!this.areAllMandatorySubStagesCompleted) return false;
    return true;
  }

  /**
   * Vérifie si l'instance est à la dernière étape
   * Version améliorée utilisant stageVisits et l'analyse des transitions
   */
  @Expose()
  get isOnLastStage(): boolean {
    if (!this.template?.stages || !this.currentStage) return false;

    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const currentStageOrder = this.currentStage.order;
    const maxOrder = Math.max(...sortedStages.map(s => s.order));

    // 1. Si l'étape courante a l'ordre maximum, c'est la dernière étape par ordre
    if (currentStageOrder === maxOrder) {
      return true;
    }

    // 2. Vérifier s'il existe des transitions sortantes depuis l'étape courante
    const hasOutgoingTransitions = this.template.transitions?.some(
      t => t.fromStageId === this.currentStageId
    ) ?? false;

    if (!hasOutgoingTransitions) {
      // Pas de transitions sortantes => potentiellement dernière étape
      return true;
    }

    // 3. Vérifier si toutes les étapes suivantes sont optionnelles ou déjà complétées
    const followingStages = sortedStages.filter(s => s.order > currentStageOrder);
    
    for (const stage of followingStages) {
      const mandatorySubStages = stage.subStages?.filter(ss => ss.isMandatory) || [];
      if (mandatorySubStages.length > 0) {
        // Il reste des étapes obligatoires après
        return false;
      }
    }

    return true;
  }

  /**
   * Vérifie si toutes les sous-étapes (y compris optionnelles) de l'étape courante sont complétées
   */
  @Expose()
  get areAllCurrentStageSubStagesCompleted(): boolean {
    if (!this.template?.stages) true;
        
    // Récupérer le stage depuis le template (déjà chargé)
    const currentStageFromTemplate = this.template?.stages?.find(
      s => s.id === this.currentStageId
    );
    
    if (!currentStageFromTemplate?.subStages) return false;
    const completedIds = this.getCompletedSubStageIdsForStage(this.currentStageId);  // ✅ Déjà agrège toutes les visites
    return currentStageFromTemplate.subStages.every(ss => completedIds.has(ss.id));
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
    if (!this.currentStageId || !this.template?.stages) {
      return { total: 0, completed: 0, mandatoryTotal: 0, mandatoryCompleted: 0, percentage: 0 };
    }

    const currentStageFromTemplate = this.template.stages.find(
      s => s.id === this.currentStageId
    );

    if (!currentStageFromTemplate?.subStages) {
      return { total: 0, completed: 0, mandatoryTotal: 0, mandatoryCompleted: 0, percentage: 0 };
    }

    // Récupérer la visite courante de l'étape actuelle
    const currentStageVisit = this.stageVisits
      ?.filter(v => v.stageId === this.currentStageId)
      .sort((a, b) => b.visitNumber - a.visitNumber)[0];

    if (!currentStageVisit) {
      return { total: 0, completed: 0, mandatoryTotal: 0, mandatoryCompleted: 0, percentage: 0 };
    }

    const allSubStages = currentStageFromTemplate.subStages;
    const mandatorySubStages = allSubStages.filter(ss => ss.isMandatory);

    // Compter les sous-étapes complétées via SubStageVisit
    const completedAll = allSubStages.filter(ss => 
      currentStageVisit.subStageVisits?.some(sv => 
        sv.subStageId === ss.id && sv.isCompleted === true
      )
    ).length;

    const completedMandatory = mandatorySubStages.filter(ss => 
      currentStageVisit.subStageVisits?.some(sv => 
        sv.subStageId === ss.id && sv.isCompleted === true
      )
    ).length;

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

    const completedIds = this.getAllCompletedSubStageIds();
    const remaining: Array<{ stageName: string; subStageName: string; subStageId: string }> = [];

    for (const stage of this.template.stages) {
      const mandatorySubStages = stage.subStages?.filter(ss => ss.isMandatory) || [];
      for (const subStage of mandatorySubStages) {
        if (!completedIds.has(subStage.id)) {
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
   * Calcule le nombre d'étapes traversées (basé sur stageVisits uniques)
   */
  @Expose()
  get stagesTraversedCount(): number {
    if (!this.stageVisits) return 0;
    const uniqueStageIds = new Set(this.stageVisits.map(v => v.stageId));
    return uniqueStageIds.size;
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

  /**
   * Version améliorée de isOnLastStage avec plus de critères
   * Pour une détection plus précise dans des workflows complexes
   */
  @Expose()
  get isOnLastStageAdvanced(): {
    isLast: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  } {
    if (!this.template?.stages || !this.currentStage) {
      return { isLast: false, reason: 'Template ou stage courant manquant', confidence: 'low' };
    }

    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const currentStageOrder = this.currentStage.order;
    const maxOrder = Math.max(...sortedStages.map(s => s.order));
    const lastStageByOrder = sortedStages.find(s => s.order === maxOrder);

    // Critère 1: Ordre maximum
    if (currentStageOrder === maxOrder) {
      return { isLast: true, reason: 'Ordre maximum atteint', confidence: 'high' };
    }

    // Critère 2: Pas de transitions sortantes
    const hasOutgoingTransitions = this.template.transitions?.some(
      t => t.fromStageId === this.currentStageId
    ) ?? false;

    console.log(this.template.transitions.length, hasOutgoingTransitions);

    if (!hasOutgoingTransitions) {
      return { isLast: true, reason: 'Aucune transition sortante définie', confidence: 'high' };
    }

    // Critère 3: Vérifier les transitions disponibles
    const availableTransitions = this.template.transitions?.filter(
      t => t.fromStageId === this.currentStageId && (!t.condition || this.evaluateCondition(t.condition))
    ) ?? [];

    if (availableTransitions.length === 0) {
      return { isLast: true, reason: 'Aucune transition disponible actuellement', confidence: 'medium' };
    }

    // Critère 4: Toutes les transitions mènent à des étapes déjà visitées
    const allTransitionsToVisitedStages = availableTransitions.every(t => {
      const hasVisited = this.stageVisits?.some(v => v.stageId === t.toStageId);
      const toStage = this.template.stages?.find(s => s.id === t.toStageId);
      // Si c'est une étape avec ordre inférieur, on considère qu'on peut y retourner
      return hasVisited || (toStage && toStage.order < currentStageOrder);
    });

    if (allTransitionsToVisitedStages) {
      return {
        isLast: true,
        reason: 'Toutes les transitions mènent à des étapes déjà visitées ou antérieures',
        confidence: 'medium'
      };
    }

    // Critère 5: Vérifier si l'étape courante a été visitée plusieurs fois sans progression
    const currentStageVisits = this.stageVisits?.filter(v => v.stageId === this.currentStageId) || [];
    if (currentStageVisits.length > 2) {
      const lastVisit = currentStageVisits.sort((a, b) => b.visitNumber - a.visitNumber)[0];
      const hasProgressInLastVisit = lastVisit?.subStageVisits?.some(sv => sv.isCompleted) ?? false;
      
      if (!hasProgressInLastVisit && currentStageVisits.length >= 3) {
        return {
          isLast: true,
          reason: 'Multiples visites sans progression, probablement étape terminale',
          confidence: 'medium'
        };
      }
    }

    return { isLast: false, reason: 'Des transitions vers de nouvelles étapes existent', confidence: 'high' };
  }

  /**
   * Évalue une condition (à implémenter selon vos besoins)
   */
  private evaluateCondition(condition: string): boolean {
    // TODO: Implémenter l'évaluation des conditions
    // Exemple: condition peut être "stage.completedSubStages.includes('xxx')"
    return true;
  }

  // Hook pour initialiser les propriétés après le chargement
  @AfterLoad()
  afterLoad() {
    // S'assurer que les tableaux existent
    if (!this.stageVisits) {
      this.stageVisits = [];
    }
    
    // Migration: Si d'anciens champs existent, on peut les migrer vers la nouvelle structure
    if (this.completedSubStages && this.completedSubStages.length > 0 && this.stageVisits.length === 0) {
      // Logique de migration (optionnelle)
      console.warn(`Instance ${this.id}: Anciens champs détectés, migration recommandée`);
    }
  }
}