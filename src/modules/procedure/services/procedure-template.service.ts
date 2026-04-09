// services/procedure-template.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { Cycle } from '../entities/cycle.entity';
import { StageConfig } from '../entities/stage-config.entity';
import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { UpdateProcedureTemplateDto } from '../dto/update-procedure-template.dto';
import { TransitionType } from '../entities/enums/instance-status.enum';

@Injectable()
export class ProcedureTemplateService {
  constructor(
    @InjectRepository(ProcedureTemplate)
    private templateRepository: Repository<ProcedureTemplate>,
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(SubStage)
    private subStageRepository: Repository<SubStage>,
    @InjectRepository(Transition)
    private transitionRepository: Repository<Transition>,
    @InjectRepository(Cycle)
    private cycleRepository: Repository<Cycle>,
    @InjectRepository(StageConfig)
    private stageConfigRepository: Repository<StageConfig>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateProcedureTemplateDto): Promise<ProcedureTemplate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Créer le template
      const template = this.templateRepository.create({
        name: dto.name,
        description: dto.description,
        version: 1,
        isActive: true,
      });
      await queryRunner.manager.save(template);

      // Map pour stocker les IDs des stages (pour les transitions/cycles)
      const stageIdMap = new Map<string, string>();

      // 2. Créer les stages et sous-stages
      for (let i = 0; i < dto.stages.length; i++) {
        const stageDto = dto.stages[i];
        const tempId = stageDto.id || `temp-${Date.now()}-${i}`;
        
        const stage = this.stageRepository.create({
          templateId: template.id,
          order: i,
          name: stageDto.name,
          description: stageDto.description,
          canBeSkipped: stageDto.canBeSkipped ?? false,
          canBeReentered: stageDto.canBeReentered ?? true,
        });
        await queryRunner.manager.save(stage);
        
        // Stocker le mapping ID temporaire -> ID réel
        stageIdMap.set(tempId, stage.id);

        // Créer les sous-stages
        if (stageDto.subStages && stageDto.subStages.length > 0) {
          for (let j = 0; j < stageDto.subStages.length; j++) {
            const subStageDto = stageDto.subStages[j];
            const subStage = this.subStageRepository.create({
              stageId: stage.id,
              order: j,
              name: subStageDto.name,
              description: subStageDto.description,
              isMandatory: subStageDto.isMandatory ?? true,
            });
            await queryRunner.manager.save(subStage);
          }
        }

        // Créer la configuration du stage si fournie
        if (dto.stageConfigs && dto.stageConfigs[tempId]) {
          const configDto = dto.stageConfigs[tempId];
          const stageConfig = this.stageConfigRepository.create({
            stageId: stage.id,
            allowDocuments: configDto.allowDocuments ?? false,
            allowDiligences: configDto.allowDiligences ?? false,
            allowInvoices: configDto.allowInvoices ?? false,
            allowHearings: configDto.allowHearings ?? false,
            documentTypesAllowed: this.serializeJson(configDto.documentTypesAllowed ?? []),
            diligenceConfig: this.serializeJson(configDto.diligenceConfig),
            hearingConfig: this.serializeJson(configDto.hearingConfig),
            invoiceConfig: this.serializeJson(configDto.invoiceConfig),
          });
          await queryRunner.manager.save(stageConfig);
        }
      }

      // 3. Créer les transitions avec les nouveaux IDs
      if (dto.transitions && dto.transitions.length > 0) {
        for (const transitionDto of dto.transitions) {
          const newFromStageId = stageIdMap.get(transitionDto.fromStageId);
          const newToStageId = stageIdMap.get(transitionDto.toStageId);
          
          if (!newFromStageId || !newToStageId) {
            console.warn(`Skipping transition: stage not found. From: ${transitionDto.fromStageId}, To: ${transitionDto.toStageId}`);
            continue;
          }
          
          const transition = this.transitionRepository.create({
            fromStageId: newFromStageId,
            toStageId: newToStageId,
            type: transitionDto.type === 'AUTOMATIC' ? TransitionType.AUTOMATIC : TransitionType.MANUAL,
            label: transitionDto.label || null,
            condition: this.serializeJson(transitionDto.condition),
            triggerEvent: transitionDto.triggerEvent || null,
            triggerCondition: this.serializeJson(transitionDto.triggerCondition),
            isDefault: transitionDto.isDefault ?? false,
            requiresDecision: transitionDto.requiresDecision ?? true,
            requiresValidation: transitionDto.requiresValidation ?? false,
            onTransition: this.serializeJson(transitionDto.onTransition),
          });
          await queryRunner.manager.save(transition);
        }
      }

      // 4. Créer les cycles avec les nouveaux IDs
      if (dto.cycles && dto.cycles.length > 0) {
        for (const cycleDto of dto.cycles) {
          const newFromStageId = stageIdMap.get(cycleDto.fromStageId);
          const newToStageId = stageIdMap.get(cycleDto.toStageId);
          
          if (!newFromStageId || !newToStageId) {
            console.warn(`Skipping cycle: stage not found. From: ${cycleDto.fromStageId}, To: ${cycleDto.toStageId}`);
            continue;
          }
          
          const cycle = this.cycleRepository.create({
            templateId: template.id,
            fromStageId: newFromStageId,
            toStageId: newToStageId,
            label: cycleDto.label || null,
            condition: this.serializeJson(cycleDto.condition),
            maxLoops: cycleDto.maxLoops ?? 1,
          });
          await queryRunner.manager.save(cycle);
        }
      }

      await queryRunner.commitTransaction();
      return this.findOne(template.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating template:', error);
      throw new BadRequestException(`Failed to create template: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(activeOnly?: boolean): Promise<ProcedureTemplate[]> {
    try {
      const where: any = {};
      if (activeOnly !== undefined) {
        where.isActive = activeOnly;
      }
      
      const templates = await this.templateRepository.find({
        where,
        relations: ['stages', 'stages.subStages', 'stages.config'],
        order: {
          createdAt: 'DESC',
          stages: { order: 'ASC' },
        },
      });

      // Charger les transitions et cycles pour chaque template
      for (const template of templates) {
        const stageIds = template.stages.map(s => s.id);
        
        if (stageIds.length > 0) {
          const transitions = await this.transitionRepository.find({
            where: { fromStageId: In(stageIds) },
            relations: ['fromStage', 'toStage'],
          });
          
          const cycles = await this.cycleRepository.find({
            where: { templateId: template.id },
          });
          
          (template as any).transitions = transitions;
          (template as any).cycles = cycles;
        } else {
          (template as any).transitions = [];
          (template as any).cycles = [];
        }
      }

      return templates;
    } catch (error) {
      console.error('Error finding templates:', error);
      throw new BadRequestException(`Failed to find templates: ${error.message}`);
    }
  }

  async findOne(id: string): Promise<ProcedureTemplate> {
    try {
      const template = await this.templateRepository.findOne({
        where: { id },
        relations: ['stages', 'stages.subStages', 'stages.config'],
      order: {
        createdAt: 'DESC',
        stages: { order: 'ASC' },
      },
      });
      
      if (!template) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }

      const stageIds = template.stages.map(s => s.id);
      
      let transitions: Transition[] = [];
      let cycles: Cycle[] = [];
      
      if (stageIds.length > 0) {
        transitions = await this.transitionRepository.find({
          where: { fromStageId: In(stageIds) },
          relations: ['fromStage', 'toStage'],
        });
        
        cycles = await this.cycleRepository.find({
          where: { templateId: id },
        });
      }

      // Désérialiser les configurations JSON
      for (const stage of template.stages) {
        if (stage.config) {
          stage.config.documentTypesAllowed = this.deserializeJson(stage.config.documentTypesAllowed);
          stage.config.diligenceConfig = this.deserializeJson(stage.config.diligenceConfig);
          stage.config.hearingConfig = this.deserializeJson(stage.config.hearingConfig);
          stage.config.invoiceConfig = this.deserializeJson(stage.config.invoiceConfig);
        }
      }

      return {
        ...template,
        transitions,
        cycles,
      } as ProcedureTemplate;
    } catch (error) {
      console.error('Error finding template:', error);
      throw error;
    }
  }

async update(id: string, dto: UpdateProcedureTemplateDto): Promise<ProcedureTemplate> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Récupérer le template existant
    const existingTemplate = await this.templateRepository.findOne({
      where: { id },
      relations: ['stages', 'stages.subStages', 'stages.config'],
    });

    if (!existingTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // 2. Mettre à jour les champs simples
    if (dto.name !== undefined) existingTemplate.name = dto.name;
    if (dto.description !== undefined) existingTemplate.description = dto.description;
    if (dto.isActive !== undefined) existingTemplate.isActive = dto.isActive;

    await queryRunner.manager.save(existingTemplate);
      const stageIdMap = new Map<string, string>();

    // 3. Gestion des stages et sous-stages
    if (dto.stages !== undefined && dto.stages.length > 0) {
      await this.updateStages(queryRunner, existingTemplate, dto.stages, dto.stageConfigs, stageIdMap);
    }

    // 4. Gestion des transitions (sans le map, on utilise templateId)
    if (dto.transitions !== undefined) {
      await this.updateTransitions(queryRunner, id, dto.transitions);
    }

    // 5. Gestion des cycles
    if (dto.cycles !== undefined) {
      await this.updateCycles(queryRunner, id, stageIdMap, dto.cycles);
    }

    await queryRunner.commitTransaction();
    return this.findOne(id);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Error updating template:', error);
    throw new BadRequestException(`Failed to update template: ${error.message}`);
  } finally {
    await queryRunner.release();
  }
}
  /**
   * Met à jour les stages et sous-stages
   */
// services/procedure-template.service.ts

private async updateStages(
  queryRunner: any,
  template: ProcedureTemplate,
  stagesDto: any[],
  stageConfigs: Record<string, any> | undefined,
  stageIdMap: Map<string, string>,
): Promise<void> {
  const existingStagesMap = new Map(template.stages.map(stage => [stage.id, stage]));
  const processedStageIds = new Set<string>();

  // ⚠️ IMPORTANT: D'abord, ajouter TOUS les stages existants au map avec leur propre ID
  for (const [stageId] of existingStagesMap) {
    stageIdMap.set(stageId, stageId);
  }

  for (let i = 0; i < stagesDto.length; i++) {
    const stageDto = stagesDto[i];
    const tempId = stageDto.id || `temp-${Date.now()}-${i}`;
    
    const isExisting = stageDto.id 
      && !stageDto.id.startsWith('temp-')
      && existingStagesMap.has(stageDto.id);
    
    let stage: Stage;
    
    if (isExisting) {
      // Mettre à jour le stage existant
      stage = existingStagesMap.get(stageDto.id)!;
      
      if (stageDto.name !== undefined) stage.name = stageDto.name;
      if (stageDto.description !== undefined) stage.description = stageDto.description;
      stage.order = i;
      if (stageDto.canBeSkipped !== undefined) stage.canBeSkipped = stageDto.canBeSkipped;
      if (stageDto.canBeReentered !== undefined) stage.canBeReentered = stageDto.canBeReentered;
      
      await queryRunner.manager.save(stage);
      
      // Mettre à jour les sous-stages
      if (stageDto.subStages !== undefined) {
        await this.updateSubStages(queryRunner, stage, stageDto.subStages);
      }
      
      // Mettre à jour la configuration du stage
      if (stageConfigs && stageConfigs[stageDto.id]) {
        await this.updateStageConfig(queryRunner, stage.id, stageConfigs[stageDto.id]);
      }
      
      processedStageIds.add(stage.id);
      
      // ⚠️ Le stage est déjà dans le map (ajouté au début)
    } else {
      // Créer un nouveau stage
      stage = this.stageRepository.create({
        templateId: template.id,
        name: stageDto.name ?? '',
        description: stageDto.description ?? '',
        order: i,
        canBeSkipped: stageDto.canBeSkipped ?? false,
        canBeReentered: stageDto.canBeReentered ?? true,
      });
      await queryRunner.manager.save(stage);
      
      // Créer les sous-stages
      if (stageDto.subStages && stageDto.subStages.length > 0) {
        for (let j = 0; j < stageDto.subStages.length; j++) {
          const subStageDto = stageDto.subStages[j];
          const subStage = this.subStageRepository.create({
            stageId: stage.id,
            name: subStageDto.name ?? '',
            description: subStageDto.description ?? '',
            order: j,
            isMandatory: subStageDto.isMandatory ?? true,
          });
          await queryRunner.manager.save(subStage);
        }
      }
      
      // Créer la configuration du stage
      if (stageConfigs && stageConfigs[tempId]) {
        const configDto = stageConfigs[tempId];
        const newConfig = new StageConfig();
        newConfig.stageId = stage.id;
        newConfig.allowDocuments = configDto.allowDocuments ?? false;
        newConfig.allowDiligences = configDto.allowDiligences ?? false;
        newConfig.allowInvoices = configDto.allowInvoices ?? false;
        newConfig.allowHearings = configDto.allowHearings ?? false;
        newConfig.documentTypesAllowed = this.serializeJson(configDto.documentTypesAllowed ?? []);
        newConfig.diligenceConfig = this.serializeJson(configDto.diligenceConfig);
        newConfig.hearingConfig = this.serializeJson(configDto.hearingConfig);
        newConfig.invoiceConfig = this.serializeJson(configDto.invoiceConfig);
        
        await queryRunner.manager.save(newConfig);
      }
      
      // Ajouter le mapping de l'ID temporaire vers le nouveau ID réel
      stageIdMap.set(tempId, stage.id);
      // Ajouter aussi le nouveau ID vers lui-même pour les références existantes
      stageIdMap.set(stage.id, stage.id);
    }
  }
  
  // Supprimer les stages non mentionnés
  for (const [stageId, stage] of existingStagesMap) {
    if (!processedStageIds.has(stageId)) {
      await queryRunner.manager.delete(Stage, stageId);
      // Retirer du map si supprimé
      stageIdMap.delete(stageId);
    }
  }
}

  /**
   * Met à jour les sous-stages d'un stage
   */
  private async updateSubStages(
    queryRunner: any,
    stage: Stage,
    subStagesDto: any[],
  ): Promise<void> {
    const existingSubStagesMap = new Map(
      (stage.subStages || []).map(ss => [ss.id, ss])
    );
    const processedSubStageIds = new Set<string>();

    for (let j = 0; j < subStagesDto.length; j++) {
      const subStageDto = subStagesDto[j];
      
      const isExisting = subStageDto.id 
        && !subStageDto.id.startsWith('temp-')
        && existingSubStagesMap.has(subStageDto.id);
      
      if (isExisting) {
        // Mettre à jour la sous-étape existante
        const subStage = existingSubStagesMap.get(subStageDto.id)!;
        
        if (subStageDto.name !== undefined) subStage.name = subStageDto.name;
        if (subStageDto.description !== undefined) subStage.description = subStageDto.description;
        subStage.order = j;
        if (subStageDto.isMandatory !== undefined) subStage.isMandatory = subStageDto.isMandatory;
        
        await queryRunner.manager.save(subStage);
        processedSubStageIds.add(subStage.id);
      } else {
        // Créer une nouvelle sous-étape
        const subStage = this.subStageRepository.create({
          stageId: stage.id,
          name: subStageDto.name ?? '',
          description: subStageDto.description ?? '',
          order: j,
          isMandatory: subStageDto.isMandatory ?? true,
        });
        await queryRunner.manager.save(subStage);
      }
    }
    
    // Supprimer les sous-stages non mentionnés
    for (const [subStageId] of existingSubStagesMap) {
      if (!processedSubStageIds.has(subStageId)) {
        await queryRunner.manager.delete(SubStage, subStageId);
      }
    }
  }

  /**
   * Met à jour la configuration d'un stage
   */
  private async updateStageConfig(
    queryRunner: any,
    stageId: string,
    configDto: any,
  ): Promise<void> {
    let config = await queryRunner.manager.findOne(StageConfig, {
      where: { stageId },
    });
    
    if (config) {
      // Mettre à jour existant
      if (configDto.allowDocuments !== undefined) config.allowDocuments = configDto.allowDocuments;
      if (configDto.allowDiligences !== undefined) config.allowDiligences = configDto.allowDiligences;
      if (configDto.allowInvoices !== undefined) config.allowInvoices = configDto.allowInvoices;
      if (configDto.allowHearings !== undefined) config.allowHearings = configDto.allowHearings;
      if (configDto.documentTypesAllowed !== undefined) config.documentTypesAllowed = this.serializeJson(configDto.documentTypesAllowed);
      if (configDto.diligenceConfig !== undefined) config.diligenceConfig = this.serializeJson(configDto.diligenceConfig);
      if (configDto.hearingConfig !== undefined) config.hearingConfig = this.serializeJson(configDto.hearingConfig);
      if (configDto.invoiceConfig !== undefined) config.invoiceConfig = this.serializeJson(configDto.invoiceConfig);
      
      await queryRunner.manager.save(config);
    } else {
      // Créer nouveau - utiliser new StageConfig() au lieu de create()
      const newConfig = new StageConfig();
      newConfig.stageId = stageId;
      newConfig.allowDocuments = configDto.allowDocuments ?? false;
      newConfig.allowDiligences = configDto.allowDiligences ?? false;
      newConfig.allowInvoices = configDto.allowInvoices ?? false;
      newConfig.allowHearings = configDto.allowHearings ?? false;
      newConfig.documentTypesAllowed = this.serializeJson(configDto.documentTypesAllowed ?? []);
      newConfig.diligenceConfig = this.serializeJson(configDto.diligenceConfig);
      newConfig.hearingConfig = this.serializeJson(configDto.hearingConfig);
      newConfig.invoiceConfig = this.serializeJson(configDto.invoiceConfig);
      
      await queryRunner.manager.save(newConfig);
    }
  }

  /**
   * Met à jour les transitions
   */
/**
 * Met à jour les transitions
 */
/**
 * Met à jour les transitions (version simplifiée)
 */
private async updateTransitions(
  queryRunner: any,
  templateId: string,
  transitionsDto: any[],
): Promise<void> {
  if (!transitionsDto ) {
    return;
  }
  
  // Récupérer tous les IDs des stages valides du template
  const stages = await queryRunner.manager.find(Stage, {
    where: { templateId },
    select: ['id'],
  });
  
  const validStageIds = new Set(stages.map(s => s.id));
      console.warn(`Okkkkkk ${JSON.stringify(stages)}`);
  
  // Supprimer toutes les transitions existantes
  if (validStageIds.size >= 0) {
    await queryRunner.manager.delete(Transition, {
      fromStageId: In(Array.from(validStageIds)),
    });
  }
  
  // Créer les nouvelles transitions
  for (const transitionDto of transitionsDto) {
    // Vérifier que les IDs des stages existent dans le template
    if (!validStageIds.has(transitionDto.fromStageId) || !validStageIds.has(transitionDto.toStageId)) {
      console.warn(`Skipping transition: stage not found. From: ${transitionDto.fromStageId}, To: ${transitionDto.toStageId}`);
      continue;
    }
    
    const transition = new Transition();
    transition.fromStageId = transitionDto.fromStageId;
    transition.toStageId = transitionDto.toStageId;
    transition.type = transitionDto.type === 'AUTOMATIC' ? TransitionType.AUTOMATIC : TransitionType.MANUAL;
    transition.label = transitionDto.label || null;
    transition.condition = this.serializeJson(transitionDto.condition);
    transition.triggerEvent = transitionDto.triggerEvent || null;
    transition.triggerCondition = this.serializeJson(transitionDto.triggerCondition);
    transition.isDefault = transitionDto.isDefault ?? false;
    transition.requiresDecision = transitionDto.requiresDecision ?? true;
    transition.requiresValidation = transitionDto.requiresValidation ?? false;
    transition.onTransition = this.serializeJson(transitionDto.onTransition);
    
    await queryRunner.manager.save(transition);
  }
}

  /**
   * Met à jour les cycles
   */
  private async updateCycles(
    queryRunner: any,
    templateId: string,
    stageIdMap: Map<string, string>,
    cyclesDto: any[],
  ): Promise<void> {
    // Supprimer tous les cycles existants
    await queryRunner.manager.delete(Cycle, { templateId });
    
    if (!cyclesDto || cyclesDto.length === 0) {
      return;
    }
    
    // Créer les nouveaux cycles avec les nouveaux IDs
    for (const cycleDto of cyclesDto) {
      const newFromStageId = stageIdMap.get(cycleDto.fromStageId);
      const newToStageId = stageIdMap.get(cycleDto.toStageId);
      
      if (!newFromStageId || !newToStageId) {
        console.warn(`Skipping cycle: stage not found in map. From: ${cycleDto.fromStageId}, To: ${cycleDto.toStageId}`);
        continue;
      }
      
      // Utiliser new Cycle() au lieu de create()
      const cycle = new Cycle();
      cycle.templateId = templateId;
      cycle.fromStageId = newFromStageId;
      cycle.toStageId = newToStageId;
      cycle.label = cycleDto.label || null;
      cycle.condition = this.serializeJson(cycleDto.condition);
      cycle.maxLoops = cycleDto.maxLoops ?? 1;
      
      await queryRunner.manager.save(cycle);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const template = await this.findOne(id);
      await this.templateRepository.remove(template);
    } catch (error) {
      console.error('Error removing template:', error);
      throw new BadRequestException(`Failed to remove template: ${error.message}`);
    }
  }

  async duplicate(id: string, newName: string): Promise<ProcedureTemplate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const original = await this.findOne(id);
      
      // Créer le nouveau template
      const newTemplate = this.templateRepository.create({
        name: newName,
        description: original.description,
        version: original.version + 1,
        isActive: true,
      });
      await queryRunner.manager.save(newTemplate);
      
      // Map des anciens IDs de stages vers les nouveaux
      const stageIdMap = new Map<string, string>();
      
      // Dupliquer les stages
      for (const stage of original.stages) {
        const newStage = this.stageRepository.create({
          templateId: newTemplate.id,
          name: stage.name,
          description: stage.description,
          order: stage.order,
          canBeSkipped: stage.canBeSkipped,
          canBeReentered: stage.canBeReentered,
        });
        await queryRunner.manager.save(newStage);
        stageIdMap.set(stage.id, newStage.id);
        
        // Dupliquer les sous-stages
        for (const subStage of stage.subStages) {
          const newSubStage = this.subStageRepository.create({
            stageId: newStage.id,
            name: subStage.name,
            description: subStage.description,
            order: subStage.order,
            isMandatory: subStage.isMandatory,
          });
          await queryRunner.manager.save(newSubStage);
        }
        
        // Dupliquer la configuration du stage
        if (stage.config) {
          const newConfig = this.stageConfigRepository.create({
            stageId: newStage.id,
            allowDocuments: stage.config.allowDocuments,
            allowDiligences: stage.config.allowDiligences,
            allowInvoices: stage.config.allowInvoices,
            allowHearings: stage.config.allowHearings,
            documentTypesAllowed: stage.config.documentTypesAllowed 
                ? JSON.stringify(stage.config.documentTypesAllowed) 
                : null,
            diligenceConfig: stage.config.diligenceConfig 
                ? JSON.stringify(stage.config.diligenceConfig) 
                : null,
            hearingConfig: stage.config.hearingConfig 
                ? JSON.stringify(stage.config.hearingConfig) 
                : null,
            invoiceConfig: stage.config.invoiceConfig 
                ? JSON.stringify(stage.config.invoiceConfig) 
                : null,
          });
          await queryRunner.manager.save(newConfig);
        }
      }
      
      // Dupliquer les transitions
      for (const transition of original.transitions || []) {
        const newFromStageId = stageIdMap.get(transition.fromStageId);
        const newToStageId = stageIdMap.get(transition.toStageId);
        
        if (newFromStageId && newToStageId) {
          const newTransition = this.transitionRepository.create({
            fromStageId: newFromStageId,
            toStageId: newToStageId,
            type: transition.type,
            label: transition.label,
            condition: transition.condition,
            triggerEvent: transition.triggerEvent,
            triggerCondition: transition.triggerCondition,
            isDefault: transition.isDefault,
            requiresDecision: transition.requiresDecision,
            requiresValidation: transition.requiresValidation,
            onTransition: transition.onTransition,
          });
          await queryRunner.manager.save(newTransition);
        }
      }
      
      // Dupliquer les cycles
      for (const cycle of original.cycles || []) {
        const newFromStageId = stageIdMap.get(cycle.fromStageId);
        const newToStageId = stageIdMap.get(cycle.toStageId);
        
        if (newFromStageId && newToStageId) {
          const newCycle = this.cycleRepository.create({
            templateId: newTemplate.id,
            fromStageId: newFromStageId,
            toStageId: newToStageId,
            label: cycle.label,
            condition: cycle.condition,
            maxLoops: cycle.maxLoops,
          });
          await queryRunner.manager.save(newCycle);
        }
      }
      
      await queryRunner.commitTransaction();
      return this.findOne(newTemplate.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error duplicating template:', error);
      throw new BadRequestException(`Failed to duplicate template: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async toggleActive(id: string, isActive: boolean): Promise<ProcedureTemplate> {
    try {
      const template = await this.findOne(id);
      template.isActive = isActive;
      await this.templateRepository.save(template);
      return this.findOne(id);
    } catch (error) {
      console.error('Error toggling template active status:', error);
      throw new BadRequestException(`Failed to toggle template active status: ${error.message}`);
    }
  }

  /**
  * Sérialise un objet en JSON string
  */
  private serializeJson(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  /**
  * Désérialise un JSON string en objet
  */
  private deserializeJson(value: string | null): any {
    if (!value || typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

}