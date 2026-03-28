import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { MappedInstance, MappedStage, MappedSubStage, SubStageStatus } from '../entities/type/instance-status.enum';
export class InstanceMapperService {
  
  /**
   * Mappe une instance avec le template actuel
   */
  mapInstanceWithCurrentTemplate(
    instance: ProcedureInstance,
    currentTemplate: ProcedureTemplate
  ): MappedInstance {
    
    // 1. IDs des sous-étapes complétées
    const completedSet = new Set(instance.completedSubStages || []);
    
    // 2. IDs des sous-étapes en cours (stockées dans metadata)
    const inProgressSet = new Set(
      Object.entries(instance.subStageMetadata || {})
        .filter(([_, meta]) => meta.startedAt && !meta.completedAt)
        .map(([id]) => id)
    );
    
    // 3. Construire les étapes
    const mappedStages: MappedStage[] = currentTemplate.stages.map(stage => {
      const mappedSubStages: MappedSubStage[] = stage.subStages.map(subStage => {
        // Déterminer le statut
        let status: SubStageStatus = 'pending';
        
        if (completedSet.has(subStage.id)) {
          status = 'completed';
        } else if (inProgressSet.has(subStage.id)) {
          status = 'in_progress';
        }
        
        return {
          id: subStage.id,
          name: subStage.name,
          description: subStage.description,
          order: subStage.order,
          isMandatory: subStage.isMandatory,
          status,
          metadata: instance.subStageMetadata?.[subStage.id] || {},
        };
      });
      
      // Calculer la progression de l'étape
      const progress = this.calculateStageProgress(stage, completedSet, inProgressSet);
      
      return {
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        canBeSkipped: stage.canBeSkipped,
        canBeReentered: stage.canBeReentered,
        subStages: mappedSubStages,
        progress,
        config: stage.config,
      };
    });
    
    // 4. Trouver l'étape courante
    const currentStage = this.findCurrentStage(mappedStages, instance.currentStageId);
    
    // 5. Progression globale
    const overallProgress = this.calculateOverallProgress(mappedStages);
    
    return {
      instance,
      stages: mappedStages,
      currentStage,
      progress: overallProgress,
    };
  }
  
  /**
   * Calcule la progression d'une étape
   */
  private calculateStageProgress(
    stage: any, 
    completedSet: Set<string>,
    inProgressSet: Set<string>
  ): number {
    if (!stage.subStages || stage.subStages.length === 0) return 0;
    
    const mandatorySubStages = stage.subStages.filter(ss => ss.isMandatory);
    if (mandatorySubStages.length === 0) return 100;
    
    let completedCount = 0;
    let inProgressCount = 0;
    
    for (const ss of mandatorySubStages) {
      if (completedSet.has(ss.id)) {
        completedCount++;
      } else if (inProgressSet.has(ss.id)) {
        inProgressCount++;
      }
    }
    
    // Les sous-étapes en cours comptent pour 50%
    const weightedProgress = completedCount + (inProgressCount * 0.5);
    
    return Math.round((weightedProgress / mandatorySubStages.length) * 100);
  }
  
  /**
   * Calcule la progression globale
   */
  private calculateOverallProgress(stages: MappedStage[]): number {
    let totalMandatory = 0;
    let weightedProgress = 0;
    
    for (const stage of stages) {
      const mandatorySubStages = stage.subStages.filter(ss => ss.isMandatory);
      totalMandatory += mandatorySubStages.length;
      
      for (const ss of mandatorySubStages) {
        if (ss.status === 'completed') {
          weightedProgress += 1;
        } else if (ss.status === 'in_progress') {
          weightedProgress += 0.5;
        }
      }
    }
    
    return totalMandatory > 0 
      ? Math.round((weightedProgress / totalMandatory) * 100)
      : 0;
  }
  
  /**
   * Trouve l'étape courante
   */
  private findCurrentStage(stages: MappedStage[], oldStageId: string): MappedStage {
    // Essayer par ID
    const byId = stages.find(s => s.id === oldStageId);
    if (byId) return byId;
    
    // Trouver la première étape avec des sous-étapes non complétées
    const firstIncomplete = stages.find(s => 
      s.subStages.some(ss => ss.status !== 'completed')
    );
    if (firstIncomplete) return firstIncomplete;
    
    return stages[stages.length - 1];
  }
}