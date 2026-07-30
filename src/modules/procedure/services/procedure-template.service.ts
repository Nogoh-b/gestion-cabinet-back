// services/procedure-template.service.ts
import { Repository, DataSource } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as jsonLogic from 'json-logic-js';

import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { UpdateProcedureTemplateDto } from '../dto/update-procedure-template.dto';
import { Cycle } from '../entities/cycle.entity';
import { TransitionType } from '../entities/enums/instance-status.enum';
import {
  ProcedureTemplate,
  ProcedureTemplateLifecycle,
} from '../entities/procedure-template.entity';
import { StageConfig } from '../entities/stage-config.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import {
  ProcedureRequirement,
  ProcedureRequirementType,
} from '../interfaces/procedure-requirement.interface';


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
        familyId: randomUUID(),
        name: dto.name,
        description: dto.description,
        version: 1,
        lifecycleStatus: ProcedureTemplateLifecycle.DRAFT,
        publishedAt: null,
        retiredAt: null,
        contentHash: null,
      });
      await queryRunner.manager.save(template);

      // Map pour stocker les IDs des stages (pour les transitions/cycles)
      const stageIdMap = new Map<string, string>();

      // 2. Créer les stages et sous-stages (si des stages sont fournis)
      if (dto.stages && dto.stages.length > 0) {
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
                requirements: this.normalizeRequirements(
                  subStageDto.requirements,
                ),
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
              throw new BadRequestException(
                `Transition invalide : étape source ou cible étrangère (${transitionDto.fromStageId} → ${transitionDto.toStageId})`,
              );
            }
            
            const transition = this.transitionRepository.create({
              fromStageId: newFromStageId,
              toStageId: newToStageId,
              templateId: template.id,
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
              throw new BadRequestException(
                `Cycle invalide : étape source ou cible étrangère (${cycleDto.fromStageId} → ${cycleDto.toStageId})`,
              );
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
      if (activeOnly === true) {
        where.lifecycleStatus = ProcedureTemplateLifecycle.PUBLISHED;
      }
      
      const templates = await this.templateRepository.find({
        where,
        relations: ['stages', 'stages.subStages', 'stages.config'],
        order: {
          id: 'DESC',
          stages: { order: 'ASC' },
        },
      });

      // Charger les transitions et cycles pour chaque template
      for (const template of templates) {
        // Charger les transitions par templateId (plus fiable)
        const transitions = await this.transitionRepository.find({
          where: { templateId: template.id },
          relations: ['fromStage', 'toStage'],
        });
        
        // Charger les cycles par templateId
        const cycles = await this.cycleRepository.find({
          where: { templateId: template.id },
        });
        
        (template as any).transitions = transitions;
        (template as any).cycles = cycles;
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
        created_at: 'DESC', 
        stages: { order: 'ASC' },
      },
      });
      
      if (!template) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }

      // Charger les transitions par templateId (plus fiable que par fromStageId)
      const transitions = await this.transitionRepository.find({
        where: { templateId: id },
        relations: ['fromStage', 'toStage'],
      });
      
      // Charger les cycles par templateId
      const cycles = await this.cycleRepository.find({
        where: { templateId: id },
      });


      // Désérialiser les configurations JSON
      for (const stage of template.stages) {
        if (stage.config) {
          stage.config.documentTypesAllowed = this.deserializeJson(stage.config.documentTypesAllowed);
          stage.config.diligenceConfig = this.deserializeJson(stage.config.diligenceConfig);
          stage.config.hearingConfig = this.deserializeJson(stage.config.hearingConfig);
          stage.config.invoiceConfig = this.deserializeJson(stage.config.invoiceConfig);
        }
      }

      // Retourner un objet simple avec toutes les propriétés pour éviter les problèmes de sérialisation
      return {
        ...template,
        transitions,
        cycles,
      } as unknown as ProcedureTemplate;
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
    const lockedTemplate = await queryRunner.manager.findOne(ProcedureTemplate, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lockedTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    if (lockedTemplate.lifecycleStatus !== ProcedureTemplateLifecycle.DRAFT) {
      throw new BadRequestException(
        'Une version publiée ou retirée est immuable. Créez une nouvelle version.',
      );
    }
    const existingTemplate = await this.loadGraphWithManager(
      queryRunner.manager,
      id,
    );

    // 2. Mettre à jour les champs simples
    if (dto.name !== undefined) existingTemplate.name = dto.name;
    if (dto.description !== undefined) existingTemplate.description = dto.description;

    await queryRunner.manager.save(existingTemplate);
      const stageIdMap = new Map<string, string>();

    // 3. Gestion des stages et sous-stages
    if (dto.stages !== undefined) {
      await this.updateStages(queryRunner, existingTemplate, dto.stages, dto.stageConfigs, stageIdMap);
    }

    // 4. Gestion des transitions (sans le map, on utilise templateId)
    if (dto.transitions !== undefined) {
      await this.updateTransitions(
        queryRunner,
        id,
        dto.transitions,
        stageIdMap,
      );
    }

    // 5. Gestion des cycles
    if (dto.cycles !== undefined) {
      await this.updateCycles(queryRunner, id, stageIdMap, dto.cycles);
    }

    await queryRunner.commitTransaction();
    return this.findOne(id);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }
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
            requirements: this.normalizeRequirements(
              subStageDto.requirements,
            ),
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
        if (subStageDto.requirements !== undefined) {
          subStage.requirements = this.normalizeRequirements(
            subStageDto.requirements,
          );
        }
        
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
          requirements: this.normalizeRequirements(
            subStageDto.requirements,
          ),
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
  stageIdMap: Map<string, string>,
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
  
  // Supprimer toutes les transitions existantes
  await queryRunner.manager.delete(Transition, { templateId });
  
  // Créer les nouvelles transitions
  for (const transitionDto of transitionsDto) {
    const fromStageId =
      stageIdMap.get(transitionDto.fromStageId) ?? transitionDto.fromStageId;
    const toStageId =
      stageIdMap.get(transitionDto.toStageId) ?? transitionDto.toStageId;
    // Vérifier que les IDs des stages existent dans le template
    if (!validStageIds.has(fromStageId) || !validStageIds.has(toStageId)) {
      throw new BadRequestException(
        `Transition invalide : étape source ou cible étrangère (${transitionDto.fromStageId} → ${transitionDto.toStageId})`,
      );
    }
    
    const transition = new Transition();
    transition.fromStageId = fromStageId;
    transition.toStageId = toStageId;
    transition.templateId = templateId;
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
    const stages = await queryRunner.manager.find(Stage, {
      where: { templateId },
      select: ['id'],
    });
    const validStageIds = new Set(stages.map((stage: Stage) => stage.id));

    // Supprimer tous les cycles existants
    await queryRunner.manager.delete(Cycle, { templateId });
    
    if (!cyclesDto || cyclesDto.length === 0) {
      return;
    }
    
    // Créer les nouveaux cycles avec les nouveaux IDs
    for (const cycleDto of cyclesDto) {
      const newFromStageId =
        stageIdMap.get(cycleDto.fromStageId) ?? cycleDto.fromStageId;
      const newToStageId =
        stageIdMap.get(cycleDto.toStageId) ?? cycleDto.toStageId;
      
      if (
        !validStageIds.has(newFromStageId) ||
        !validStageIds.has(newToStageId)
      ) {
        throw new BadRequestException(
          `Cycle invalide : étape source ou cible étrangère (${cycleDto.fromStageId} → ${cycleDto.toStageId})`,
        );
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
    await this.dataSource.transaction(async (manager) => {
      const template = await manager.findOne(ProcedureTemplate, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!template) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      if (template.lifecycleStatus !== ProcedureTemplateLifecycle.DRAFT) {
        throw new BadRequestException(
          'Une version publiée ou retirée ne peut pas être supprimée',
        );
      }
      await manager.remove(template);
    });
  }

  async duplicate(id: string, newName: string): Promise<ProcedureTemplate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedOriginal = await queryRunner.manager.findOne(
        ProcedureTemplate,
        {
          where: { id },
          lock: { mode: 'pessimistic_read' },
        },
      );
      if (!lockedOriginal) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      const original = await this.loadGraphWithManager(
        queryRunner.manager,
        id,
      );
      const versionRow = await queryRunner.manager
        .createQueryBuilder(ProcedureTemplate, 'template')
        .select('MAX(template.version)', 'maxVersion')
        .where('template.familyId = :familyId', {
          familyId: original.familyId,
        })
        .getRawOne();
      const nextVersion = Number(versionRow?.maxVersion ?? 0) + 1;
      
      // Créer le nouveau template
      const newTemplate = this.templateRepository.create({
        familyId: original.familyId,
        name: newName || original.name,
        description: original.description,
        version: nextVersion,
        lifecycleStatus: ProcedureTemplateLifecycle.DRAFT,
        publishedAt: null,
        retiredAt: null,
        contentHash: null,
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
            requirements: this.cloneRequirements(subStage.requirements),
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
            templateId: newTemplate.id,
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

  async publish(id: string): Promise<ProcedureTemplate> {
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(ProcedureTemplate, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      if (locked.lifecycleStatus !== ProcedureTemplateLifecycle.DRAFT) {
        throw new BadRequestException(
          'Seule une version brouillon peut être publiée',
        );
      }

      const template = await this.loadGraphWithManager(manager, id);
      this.validateGraph(template);
      const snapshot = this.buildSnapshot(template);
      locked.contentHash = this.hashSnapshot(snapshot);
      locked.lifecycleStatus = ProcedureTemplateLifecycle.PUBLISHED;
      locked.publishedAt = new Date();
      locked.retiredAt = null;
      await manager.save(locked);
    });
    return this.findOne(id);
  }

  async retire(id: string): Promise<ProcedureTemplate> {
    await this.dataSource.transaction(async (manager) => {
      const template = await manager.findOne(ProcedureTemplate, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!template) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      if (
        template.lifecycleStatus !== ProcedureTemplateLifecycle.PUBLISHED
      ) {
        throw new BadRequestException(
          'Seule une version publiée peut être retirée',
        );
      }
      template.lifecycleStatus = ProcedureTemplateLifecycle.RETIRED;
      template.retiredAt = new Date();
      await manager.save(template);
    });
    return this.findOne(id);
  }

  private async loadGraphWithManager(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<ProcedureTemplate> {
    const template = await manager.findOne(ProcedureTemplate, {
      where: { id },
      relations: [
        'stages',
        'stages.subStages',
        'stages.config',
        'transitions',
        'cycles',
      ],
    });
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    return template;
  }

  buildSnapshot(template: ProcedureTemplate): Record<string, any> {
    const stages = [...(template.stages ?? [])]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((stage) => ({
        id: stage.id,
        name: stage.name,
        description: stage.description ?? null,
        order: stage.order,
        canBeSkipped: stage.canBeSkipped,
        canBeReentered: stage.canBeReentered,
        config: stage.config
          ? {
              allowDocuments: stage.config.allowDocuments,
              allowDiligences: stage.config.allowDiligences,
              allowInvoices: stage.config.allowInvoices,
              allowHearings: stage.config.allowHearings,
              documentTypesAllowed:
                this.deserializeJson(stage.config.documentTypesAllowed) ?? [],
              diligenceConfig:
                this.deserializeJson(stage.config.diligenceConfig) ?? null,
              hearingConfig:
                this.deserializeJson(stage.config.hearingConfig) ?? null,
              invoiceConfig:
                this.deserializeJson(stage.config.invoiceConfig) ?? null,
            }
          : null,
        subStages: [...(stage.subStages ?? [])]
          .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
          .map((subStage) => ({
            id: subStage.id,
            name: subStage.name,
            description: subStage.description ?? null,
            order: subStage.order,
            isMandatory: subStage.isMandatory,
            requirements: this.cloneRequirements(subStage.requirements),
          })),
      }));

    return {
      familyId: template.familyId,
      versionId: template.id,
      version: template.version,
      name: template.name,
      description: template.description ?? null,
      stages,
      transitions: [...(template.transitions ?? [])]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((transition) => ({
          id: transition.id,
          fromStageId: transition.fromStageId,
          toStageId: transition.toStageId,
          type: transition.type,
          label: transition.label ?? null,
          condition: this.parseJsonValue(transition.condition),
          triggerEvent: transition.triggerEvent ?? null,
          triggerCondition: this.parseJsonValue(transition.triggerCondition),
          isDefault: transition.isDefault,
          requiresDecision: transition.requiresDecision,
          requiresValidation: transition.requiresValidation,
          onTransition: this.parseJsonValue(transition.onTransition),
        })),
      cycles: [...(template.cycles ?? [])]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((cycle) => ({
          id: cycle.id,
          fromStageId: cycle.fromStageId,
          toStageId: cycle.toStageId,
          label: cycle.label ?? null,
          condition: this.parseJsonValue(cycle.condition),
          maxLoops: cycle.maxLoops,
        })),
    };
  }

  hashSnapshot(snapshot: Record<string, any>): string {
    return createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex');
  }

  private validateGraph(template: ProcedureTemplate): void {
    const stages = template.stages ?? [];
    const transitions = template.transitions ?? [];
    const cycles = template.cycles ?? [];
    const errors: string[] = [];

    if (stages.length === 0) {
      errors.push('le graphe ne contient aucune étape');
    }

    const stageIds = new Set(stages.map((stage) => stage.id));
    const orders = new Set<number>();
    for (const stage of stages) {
      if (orders.has(stage.order)) {
        errors.push(`ordre d'étape dupliqué : ${stage.order}`);
      }
      orders.add(stage.order);
    }

    const incoming = new Map(stages.map((stage) => [stage.id, 0]));
    const outgoing = new Map(stages.map((stage) => [stage.id, [] as string[]]));
    const requirementIds = new Set<string>();
    for (const stage of stages) {
      for (const subStage of stage.subStages ?? []) {
        for (const requirement of subStage.requirements ?? []) {
          if (!requirement.id) {
            errors.push(
              `exigence sans identifiant sur la sous-étape ${subStage.name}`,
            );
          } else if (requirementIds.has(requirement.id)) {
            errors.push(`identifiant d'exigence dupliqué : ${requirement.id}`);
          } else {
            requirementIds.add(requirement.id);
          }
          if (
            !Object.values(ProcedureRequirementType).includes(requirement.type)
          ) {
            errors.push(
              `type d'exigence inconnu sur la sous-étape ${subStage.name}`,
            );
          }
          if (
            requirement.type === ProcedureRequirementType.FIELD_REQUIRED &&
            !requirement.field?.trim()
          ) {
            errors.push(
              `champ obligatoire absent sur l'exigence ${requirement.id}`,
            );
          }
          if (
            requirement.type === ProcedureRequirementType.APPROVAL &&
            (!Number.isInteger(requirement.approvalCount ?? 1) ||
              (requirement.approvalCount ?? 1) < 1)
          ) {
            errors.push(
              `nombre d'approbations invalide sur l'exigence ${requirement.id}`,
            );
          }
        }
      }
    }
    for (const transition of transitions) {
      if (
        !stageIds.has(transition.fromStageId) ||
        !stageIds.has(transition.toStageId)
      ) {
        errors.push(`transition ${transition.id} vers une étape étrangère`);
        continue;
      }
      if (transition.fromStageId === transition.toStageId) {
        errors.push(`transition ${transition.id} réflexive`);
      }
      incoming.set(
        transition.toStageId,
        (incoming.get(transition.toStageId) ?? 0) + 1,
      );
      outgoing.get(transition.fromStageId)?.push(transition.toStageId);
      if (!this.isValidCondition(transition.condition)) {
        errors.push(`condition illisible sur la transition ${transition.id}`);
      }
      if (!this.hasKnownActions(transition.onTransition)) {
        errors.push(`action inconnue sur la transition ${transition.id}`);
      }
    }

    const starts = stages.filter((stage) => incoming.get(stage.id) === 0);
    const ends = stages.filter(
      (stage) => (outgoing.get(stage.id)?.length ?? 0) === 0,
    );
    if (starts.length !== 1) {
      errors.push(`le graphe doit avoir un départ unique (${starts.length})`);
    }
    if (ends.length === 0) {
      errors.push("le graphe n'a aucune arrivée");
    }

    for (const cycle of cycles) {
      if (
        !stageIds.has(cycle.fromStageId) ||
        !stageIds.has(cycle.toStageId)
      ) {
        errors.push(`cycle ${cycle.id} vers une étape étrangère`);
      }
      if (!Number.isInteger(cycle.maxLoops) || cycle.maxLoops < 1) {
        errors.push(`cycle ${cycle.id} non borné`);
      }
      if (!this.isValidCondition(cycle.condition)) {
        errors.push(`condition illisible sur le cycle ${cycle.id}`);
      }
    }

    if (starts.length === 1) {
      const visited = new Set<string>();
      const queue = [starts[0].id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const target of outgoing.get(current) ?? []) queue.push(target);
        for (const cycle of cycles.filter((item) => item.fromStageId === current)) {
          queue.push(cycle.toStageId);
        }
      }
      for (const stage of stages) {
        if (!visited.has(stage.id)) {
          errors.push(`étape inaccessible : ${stage.name}`);
        }
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasUnboundedCycle = (stageId: string): boolean => {
      if (visiting.has(stageId)) return true;
      if (visited.has(stageId)) return false;
      visiting.add(stageId);
      for (const target of outgoing.get(stageId) ?? []) {
        if (hasUnboundedCycle(target)) return true;
      }
      visiting.delete(stageId);
      visited.add(stageId);
      return false;
    };
    if (stages.some((stage) => hasUnboundedCycle(stage.id))) {
      errors.push(
        'un cycle existe dans les transitions ordinaires ; utilisez un cycle borné',
      );
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Le graphe procédural ne peut pas être publié',
        errors: [...new Set(errors)],
      });
    }
  }

  private parseJsonValue(value: any): any {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private isValidCondition(value: any): boolean {
    const parsed = this.parseJsonValue(value);
    if (parsed === null) return true;
    if (
      parsed === undefined ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return false;
    }
    try {
      jsonLogic.apply(parsed, {});
      return true;
    } catch {
      return false;
    }
  }

  private hasKnownActions(value: any): boolean {
    const parsed = this.parseJsonValue(value);
    if (parsed === null) return true;
    if (
      parsed === undefined ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return false;
    }
    const allowed = new Set([
      'createTask',
      'notify',
      'setInstanceData',
      'createReminder',
    ]);
    return Object.keys(parsed).every((key) => allowed.has(key));
  }

  private normalizeRequirements(
    requirements: Array<Partial<ProcedureRequirement>> | null | undefined,
  ): ProcedureRequirement[] {
    if (!requirements?.length) return [];
    return requirements.map((requirement) => ({
      id: requirement.id?.trim() || randomUUID(),
      type: requirement.type as ProcedureRequirementType,
      ...(requirement.label?.trim()
        ? { label: requirement.label.trim() }
        : {}),
      ...(requirement.documentTypeId
        ? { documentTypeId: requirement.documentTypeId }
        : {}),
      ...(requirement.taskId?.trim()
        ? { taskId: requirement.taskId.trim() }
        : {}),
      ...(requirement.field?.trim()
        ? { field: requirement.field.trim() }
        : {}),
      ...(requirement.approvalCount
        ? { approvalCount: requirement.approvalCount }
        : {}),
      ...(requirement.approvalRole?.trim()
        ? { approvalRole: requirement.approvalRole.trim() }
        : {}),
    }));
  }

  private cloneRequirements(
    requirements: ProcedureRequirement[] | null | undefined,
  ): ProcedureRequirement[] {
    return (requirements ?? []).map((requirement) => ({
      ...requirement,
    }));
  }

  // ── Méthodes utilitaires pour la duplication de template ───────────────────

  /**
   * Cherche un template par son nom (unique).
   * Utile pour le dédup dans les subscribers.
   */
  async findByName(
    name: string,
    relations?: string[],
  ): Promise<ProcedureTemplate | null> {
    return this.templateRepository.findOne({
      where: { name },
      relations: relations ?? [],
    });
  }

  /**
   * Duplique un template source (stages, sub-stages, transitions compris)
   * avec un nouveau nom et une description optionnelle.
   *
   * Utilisé par ProcedureTypeSubscriber pour générer un template personnalisé
   * à partir du template générique.
   */
  async duplicateTemplate(
    source: ProcedureTemplate,
    newName: string,
    description?: string,
  ): Promise<ProcedureTemplate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Créer le nouveau template
      const template = this.templateRepository.create({
        familyId: randomUUID(),
        name: newName,
        description: description ?? source.description,
        version: 1,
        lifecycleStatus: ProcedureTemplateLifecycle.DRAFT,
        publishedAt: null,
        retiredAt: null,
        contentHash: null,
      });
      await queryRunner.manager.save(template);

      // Map ID temporaire (ancien stage ID) → ID réel (nouveau stage ID)
      const stageIdMap = new Map<string, string>();

      // 2. Copier les stages et sous-stages
      const sourceStages = [...(source.stages ?? [])];
      // Trier par ordre
      sourceStages.sort((a, b) => a.order - b.order);

      for (const sourceStage of sourceStages) {
        const stage = this.stageRepository.create({
          templateId: template.id,
          order: sourceStage.order,
          name: sourceStage.name,
          description: sourceStage.description,
          canBeSkipped: sourceStage.canBeSkipped,
          canBeReentered: sourceStage.canBeReentered,
        });
        await queryRunner.manager.save(stage);
        stageIdMap.set(sourceStage.id, stage.id);

        // Copier les sous-stages
        const sourceSubStages = sourceStage.subStages ?? [];
        sourceSubStages.sort((a, b) => a.order - b.order);

        for (const sourceSubStage of sourceSubStages) {
          const subStage = this.subStageRepository.create({
            stageId: stage.id,
            order: sourceSubStage.order,
            name: sourceSubStage.name,
            description: sourceSubStage.description,
            isMandatory: sourceSubStage.isMandatory,
            requirements: this.cloneRequirements(
              sourceSubStage.requirements,
            ),
          });
          await queryRunner.manager.save(subStage);
        }
      }

      // 3. Copier les transitions
      const sourceTransitions = (source as any).transitions ?? [];
      for (const sourceTransition of sourceTransitions) {
        const newFromStageId = stageIdMap.get(sourceTransition.fromStageId);
        const newToStageId = stageIdMap.get(sourceTransition.toStageId);

        if (!newFromStageId || !newToStageId) {
          continue; // skip les transitions dont les stages n'existent plus
        }

        const transition = this.transitionRepository.create({
          fromStageId: newFromStageId,
          toStageId: newToStageId,
          templateId: template.id,
          type: sourceTransition.type ?? TransitionType.MANUAL,
          label: sourceTransition.label ?? null,
          condition: sourceTransition.condition ?? null,
          isDefault: sourceTransition.isDefault ?? false,
          requiresDecision: sourceTransition.requiresDecision ?? true,
          requiresValidation: sourceTransition.requiresValidation ?? false,
          triggerEvent: sourceTransition.triggerEvent ?? null,
          triggerCondition: sourceTransition.triggerCondition ?? null,
          onTransition: sourceTransition.onTransition ?? null,
        });
        await queryRunner.manager.save(transition);
      }

      await queryRunner.commitTransaction();
      return this.findOne(template.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Failed to duplicate template: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
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
