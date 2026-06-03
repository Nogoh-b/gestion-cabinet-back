// entities/procedure-instance.entity.ts

import { Expose } from 'class-transformer';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
  AfterLoad,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';

import { Decision } from './decision.entity';
import { InstanceStatus } from './enums/instance-status.enum';
import { HistoryEntry } from './history-entry.entity';
import { ProcedureTemplate } from './procedure-template.entity';
import { StageVisit } from './stage-visit.entity';
import { Stage } from './stage.entity';
import { Task } from './task.entity';


@Entity('procedure_instances')
@BusinessTable({
  label: 'Instances de procédure',
  description: 'Instance d\'exécution d\'un modèle de procédure. C\'est le cœur du workflow : une instance représente le suivi concret d\'un dossier à travers ses étapes et sous-étapes, avec l\'état d\'avancement réel.',
  icon: '⚙️',
  category: 'procedure',
  ignored: false,
})
export class ProcedureInstance extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'instance de procédure (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: string;

  @Column()
  @BusinessColumn({
    label: 'Modèle de procédure',
    description: 'Identifiant du modèle de procédure utilisé',
    importance: 'high',
    group: 'relation',
    ignored: true
  })
  templateId: string;

  @ManyToOne(() => ProcedureTemplate)
  @JoinColumn({ name: 'templateId' })
  @BusinessColumn({
    label: 'Modèle',
    description: 'Modèle de procédure qui définit la structure (étapes, sous-étapes, transitions)',
    importance: 'critical',
    group: 'relation'
  })
  template: ProcedureTemplate;

  @Column()
  @BusinessColumn({
    label: 'Titre',
    description: 'Titre ou description de l\'instance de procédure',
    example: 'Procédure contentieuse - Dossier Dupont',
    importance: 'critical',
    group: 'identification'
  })
  title: string;

  @Column({ type: 'enum', enum: InstanceStatus, default: InstanceStatus.ACTIVE })
  @BusinessColumn({
    label: 'Statut',
    description: 'active (En cours), suspended (Suspendue), closed (Fermée), abandoned (Abandonnée), completed (Terminée), paused (En pause), in_progress (En progression)',
    importance: 'critical',
    group: 'état'
  })
  status: InstanceStatus;

  @Column()
  @BusinessColumn({
    label: 'Étape courante',
    description: 'Identifiant de l\'étape actuellement active',
    importance: 'high',
    group: 'relation',
    ignored: true
  })
  currentStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'currentStageId' })
  @BusinessColumn({
    label: 'Étape actuelle',
    description: 'Étape du workflow dans laquelle se trouve l\'instance',
    importance: 'critical',
    group: 'état'
  })
  currentStage: Stage;

  @OneToMany(() => Decision, (decision) => decision.instance, { cascade: true })
  decisions: Decision[];

  @OneToMany(() => HistoryEntry, (history) => history.instance, { cascade: true })
  history: HistoryEntry[];

  @OneToMany(() => Task, (task) => task.instance, { cascade: true })
  tasks: Task[];

  @Column({ type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Sous-étapes complétées (déprécié)',
    description: 'Ancien champ. Utiliser stageVisits à la place.',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  completedSubStages: string[];

  @Column({ type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Compteurs cycles (déprécié)',
    description: 'Ancien champ. Utiliser stageVisits à la place.',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  cycleUsageCount: Record<string, number>;

  @Column({ type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Métadonnées sous-étapes (déprécié)',
    description: 'Ancien champ. Utiliser stageVisits à la place.',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  subStageMetadata: Record<string, any>;

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity

  @OneToMany(() => StageVisit, (visit) => visit.instance, { cascade: true })
  stageVisits: StageVisit[];

  @ManyToMany(() => DocumentCustomer, (document) => document.procedureInstances)
  @JoinTable({
    name: 'procedure_instance_documents',
    joinColumn: { name: 'procedure_instance_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  @BusinessColumn({
    label: 'Documents',
    description: 'Documents associés à cette instance de procédure',
    importance: 'medium',
    group: 'relation'
  })
  documents: DocumentCustomer[];


  // ==================== GETTERS MÉTIER (exposés à l'IA) ====================

  @Expose()
  @BusinessColumn({
    label: 'Total sous-étapes',
    description: 'Nombre total de sous-étapes dans le modèle (toutes étapes confondues)',
    importance: 'high',
    group: 'statistiques'
  })
  get totalSubStagesCount(): number {
    if (!this.template?.stages) return 0;
    return this.template.stages.reduce((total, stage) => {
      return total + (stage.subStages?.length || 0);
    }, 0);
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes obligatoires total',
    description: 'Nombre total de sous-étapes obligatoires',
    importance: 'high',
    group: 'statistiques'
  })
  get totalMandatorySubStagesCount(): number {
    if (!this.template?.stages) return 0;
    return this.template.stages.reduce((total, stage) => {
      return total + (stage.subStages?.filter(ss => ss.isMandatory)?.length || 0);
    }, 0);
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes complétées',
    description: 'Nombre de sous-étapes déjà terminées',
    importance: 'high',
    group: 'statistiques'
  })
  get completedSubStagesCount(): number {
    return this.getAllCompletedSubStageIds().size;
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes obligatoires complétées',
    description: 'Nombre de sous-étapes obligatoires déjà terminées',
    importance: 'high',
    group: 'statistiques'
  })
  get completedMandatorySubStagesCount(): number {
    if (!this.template?.stages) return 0;
    const completedIds = this.getAllCompletedSubStageIds();
    const mandatorySubStageIds = this.template.stages.flatMap(stage =>
      stage.subStages?.filter(ss => ss.isMandatory).map(ss => ss.id) || []
    );
    return mandatorySubStageIds.filter(id => completedIds.has(id)).length;
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes restantes',
    description: 'Nombre de sous-étapes encore à traiter',
    importance: 'high',
    group: 'statistiques'
  })
  get remainingSubStagesCount(): number {
    return this.totalSubStagesCount - this.completedSubStagesCount;
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes obligatoires restantes',
    description: 'Nombre de sous-étapes obligatoires encore à traiter',
    importance: 'high',
    group: 'statistiques'
  })
  get remainingMandatorySubStagesCount(): number {
    return this.totalMandatorySubStagesCount - this.completedMandatorySubStagesCount;
  }

  @Expose()
  @BusinessColumn({
    label: 'Total sous-étapes à compléter',
    description: 'Nombre total de sous-étapes (obligatoires des étapes passées + toutes des étapes courantes/futures)',
    importance: 'high',
    group: 'statistiques'
  })
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
        const mandatoryNotCompleted = stageSubStages.filter(ss => 
          ss.isMandatory && !completedIds.has(ss.id)
        ).length;
        total += mandatoryNotCompleted;
      } else {
        total += stageSubStages.length;
      }
    }
    return total;
  }

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes complétées (progression)',
    description: 'Nombre de sous-étapes complétées selon la logique de progression',
    importance: 'high',
    group: 'statistiques'
  })
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
        completed += stageSubStages.filter(ss => ss.isMandatory).length;
      } else if (i === currentStageIndex) {
        completed += stageSubStages.filter(ss => completedIds.has(ss.id)).length;
      }
    }
    return completed;
  }

  @Expose()
  @BusinessColumn({
    label: 'Avancement global',
    description: 'Pourcentage de progression de la procédure (0-100%)',
    unit: '%',
    format: 'percentage',
    importance: 'critical',
    group: 'statistiques'
  })
  get progressPercentage(): number {
    const total = this.totalSubStagesToCompleteCount;
    if (total === 0) return 100;
    return Math.round((this.completedSubStagesToCompleteCount / total) * 100);
  }

  @Expose()
  @BusinessColumn({
    label: 'Étape courante terminée',
    description: 'True = toutes les sous-étapes obligatoires de l\'étape actuelle sont complétées',
    importance: 'high',
    group: 'état'
  })
  get isCurrentStageCompleted(): boolean {
    if (!this.currentStageId || !this.template?.stages) return false;
    const currentStageFromTemplate = this.template.stages.find(
      s => s.id === this.currentStageId
    );
    if (!currentStageFromTemplate?.subStages) return false;
    const completedIds = this.getCompletedSubStageIdsForStage(this.currentStageId);
    const mandatorySubStages = currentStageFromTemplate.subStages.filter(ss => ss.isMandatory);
    return mandatorySubStages.every(ss => completedIds.has(ss.id));
  }

  @Expose()
  @BusinessColumn({
    label: 'Toutes sous-étapes obligatoires complétées',
    description: 'True = toutes les sous-étapes obligatoires sont complétées',
    importance: 'high',
    group: 'état'
  })
  get areAllMandatorySubStagesCompleted(): boolean {
    return this.remainingMandatorySubStagesCount === 0;
  }

  @Expose()
  @BusinessColumn({
    label: 'Instance terminée',
    description: 'True = toutes les sous-étapes obligatoires sont complétées',
    importance: 'high',
    group: 'état'
  })
  get isFullyCompleted(): boolean {
    return this.areAllMandatorySubStagesCompleted;
  }

  @Expose()
  @BusinessColumn({
    label: 'Dernière étape',
    description: 'True = l\'instance est à la dernière étape de la procédure',
    importance: 'high',
    group: 'état'
  })
  get isOnLastStage(): boolean {
    if (!this.template?.stages || !this.currentStage) return false;
    const sortedStages = [...this.template.stages].sort((a, b) => a.order - b.order);
    const currentStageOrder = this.currentStage.order;
    const maxOrder = Math.max(...sortedStages.map(s => s.order));
    if (currentStageOrder === maxOrder) return true;
    const hasOutgoingTransitions = this.template.transitions?.some(
      t => t.fromStageId === this.currentStageId
    ) ?? false;
    if (!hasOutgoingTransitions) return true;
    return false;
  }

  @Expose()
  @BusinessColumn({
    label: 'Toutes sous-étapes étape courante complétées',
    description: 'True = toutes les sous-étapes (y compris optionnelles) de l\'étape courante sont complétées',
    importance: 'medium',
    group: 'état'
  })
  get areAllCurrentStageSubStagesCompleted(): boolean {
    if (!this.template?.stages) return true;
    const currentStageFromTemplate = this.template.stages.find(
      s => s.id === this.currentStageId
    );
    if (!currentStageFromTemplate?.subStages) return false;
    const completedIds = this.getCompletedSubStageIdsForStage(this.currentStageId);
    return currentStageFromTemplate.subStages.every(ss => completedIds.has(ss.id));
  }

  @Expose()
  @BusinessColumn({
    label: 'Peut être terminée',
    description: 'True = toutes les sous-étapes obligatoires sont complétées et l\'instance est active',
    importance: 'high',
    group: 'état'
  })
  get canBeCompleted(): boolean {
    return this.areAllMandatorySubStagesCompleted && this.status === InstanceStatus.ACTIVE;
  }

  @Expose()
  @BusinessColumn({
    label: 'Étapes traversées',
    description: 'Nombre d\'étapes distinctes déjà parcourues',
    importance: 'medium',
    group: 'statistiques'
  })
  get stagesTraversedCount(): number {
    if (!this.stageVisits) return 0;
    const uniqueStageIds = new Set(this.stageVisits.map(v => v.stageId));
    return uniqueStageIds.size;
  }

  @Expose()
  @BusinessColumn({
    label: 'Durée totale',
    description: 'Temps total écoulé depuis la création de l\'instance (en jours)',
    unit: 'jours',
    importance: 'medium',
    group: 'dates'
  })
  get totalDurationInDays(): number | null {
    if (!this.created_at) return null;
    const endDate = this.completedAt || new Date();
    const diffTime = Math.abs(endDate.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  @Expose()
  @BusinessColumn({
    label: 'Date de completion',
    description: 'Date à laquelle l\'instance a été terminée',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  get completedAt(): Date | null {
    if (this.status === InstanceStatus.COMPLETED && this.updated_at) {
      return this.updated_at;
    }
    return null;
  }

  @Expose()
  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [InstanceStatus.ACTIVE]: 'Active',
      [InstanceStatus.SUSPENDED]: 'Suspendue',
      [InstanceStatus.CLOSED]: 'Fermée',
      [InstanceStatus.ABANDONED]: 'Abandonnée',
      [InstanceStatus.COMPLETED]: 'Terminée',
      [InstanceStatus.PAUSED]: 'En pause',
      [InstanceStatus.IN_PROGRESS]: 'En progression'
    };
    return labels[this.status] || this.status;
  }

  @Expose()
  @BusinessColumn({
    label: 'Avancement étape courante',
    description: 'Progression détaillée de l\'étape actuelle (total, complétées, obligatoires, pourcentage)',
    importance: 'high',
    group: 'statistiques'
  })
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
    const currentStageVisit = this.stageVisits
      ?.filter(v => v.stageId === this.currentStageId)
      .sort((a, b) => b.visitNumber - a.visitNumber)[0];
    if (!currentStageVisit) {
      return { total: 0, completed: 0, mandatoryTotal: 0, mandatoryCompleted: 0, percentage: 0 };
    }
    const allSubStages = currentStageFromTemplate.subStages;
    const mandatorySubStages = allSubStages.filter(ss => ss.isMandatory);
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

  @Expose()
  @BusinessColumn({
    label: 'Sous-étapes obligatoires restantes',
    description: 'Liste détaillée des sous-étapes obligatoires encore à traiter',
    importance: 'high',
    group: 'statistiques'
  })
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

  // ==================== MÉTHODES PRIVÉES ====================

  private getCurrentStageVisit(stageId?: string): StageVisit | undefined {
    const targetStageId = stageId || this.currentStageId;
    if (!targetStageId) return undefined;
    return this.stageVisits?.filter(v => v.stageId === targetStageId)
      .sort((a, b) => b.visitNumber - a.visitNumber)[0];
  }

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
      if (visit.completedSubStages) {
        visit.completedSubStages.forEach(id => completed.add(id));
      }
    }
    return completed;
  }

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
        if (visit.completedSubStages) {
          visit.completedSubStages.forEach(id => completed.add(id));
        }
      }
    }
    if (this.completedSubStages) {
      this.completedSubStages.forEach(id => completed.add(id));
    }
    return completed;
  }

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

  @AfterLoad()
  afterLoad() {
    if (!this.stageVisits) {
      this.stageVisits = [];
    }
    if (this.completedSubStages && this.completedSubStages.length > 0 && this.stageVisits.length === 0) {
      console.warn(`Instance ${this.id}: Anciens champs détectés, migration recommandée`);
    }
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
}