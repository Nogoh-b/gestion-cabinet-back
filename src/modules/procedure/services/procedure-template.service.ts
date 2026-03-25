// services/procedure-template.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { CreateProcedureTemplateDto, UpdateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { UpdateSubStageDto } from '../dto/update-procedure-template.dto';

@Injectable()
export class ProcedureTemplateService {
  constructor(
    @InjectRepository(ProcedureTemplate)
    private templateRepository: Repository<ProcedureTemplate>,
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(SubStage)
    private subStageRepository: Repository<SubStage>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateProcedureTemplateDto): Promise<ProcedureTemplate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Créer le template
      const template = this.templateRepository.create({
        name: dto.name,
        description: dto.description,
        version: 1,
        isActive: true,
      });
      await queryRunner.manager.save(template);

      // Créer les stages avec leurs sous-stages
      for (let i = 0; i < dto.stages.length; i++) {
        const stageDto = dto.stages[i];
        const stage = this.stageRepository.create({
          templateId: template.id,
          order: i,
          name: stageDto.name,
          description: stageDto.description,
          canBeSkipped: stageDto.canBeSkipped ?? false,
          canBeReentered: stageDto.canBeReentered ?? true,
        });
        await queryRunner.manager.save(stage);

        if (stageDto.subStages) {
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
      }

      await queryRunner.commitTransaction();
      return this.findOne(template.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(activeOnly?: boolean): Promise<ProcedureTemplate[]> {
    const where: any = {};
    if (activeOnly !== undefined) {
      where.isActive = activeOnly;
    }
    
    return this.templateRepository.find({
      where,
      relations: ['stages', 'stages.subStages'],
      order: {
        createdAt: 'DESC',
        stages: {
          order: 'ASC',
          subStages: {
            order: 'ASC',
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<ProcedureTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['stages', 'stages.subStages', 'transitions', 'cycles'],
      order: {
        stages: {
          order: 'ASC',
          subStages: {
            order: 'ASC',
          },
        },
      },
    });
    
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    
    return template;
  }

  // MÉTHODE UPDATE CORRIGÉE
async update(id: string, dto: UpdateProcedureTemplateDto): Promise<ProcedureTemplate> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Récupérer le template existant avec ses relations
    const existingTemplate = await this.templateRepository.findOne({
      where: { id },
      relations: ['stages', 'stages.subStages'],
    });

    if (!existingTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // 2. Mettre à jour les champs simples
    if (dto.name !== undefined) existingTemplate.name = dto.name;
    if (dto.description !== undefined) existingTemplate.description = dto.description;
    if (dto.isActive !== undefined) existingTemplate.isActive = dto.isActive;

    await queryRunner.manager.save(existingTemplate);

    // 3. Si des stages sont fournis, les traiter
    if (dto.stages !== undefined && dto.stages.length > 0) {
      
      // Créer une Map des stages existants pour un accès rapide
      const existingStagesMap = new Map(
        existingTemplate.stages.map(stage => [stage.id, stage])
      );

      // Pour suivre les stages qui ont été traités
      const processedStageIds = new Set<string>();

      // Traiter chaque stage du DTO
      for (let i = 0; i < dto.stages.length; i++) {
        const stageDto = dto.stages[i];
        
        // Déterminer si c'est un stage existant
        // Un stage est existant si :
        // 1. Il a un ID
        // 2. L'ID ne commence pas par 'temp-'
        // 3. L'ID existe dans la base
        const isExisting = stageDto.id 
          && !stageDto.id.startsWith('temp-')
          && existingStagesMap.has(stageDto.id);
        
        let stage: Stage;
        
        if (isExisting) {
          // ✅ Mettre à jour le stage existant
          if (!stageDto.id) {
            throw new Error('SubStage id is required');
          }
          stage = existingStagesMap.get(stageDto.id)!;
          
          // Mettre à jour les champs
          if (stageDto.name !== undefined) stage.name = stageDto.name;
          if (stageDto.description !== undefined) stage.description = stageDto.description;
          stage.order = i;
          if (stageDto.canBeSkipped !== undefined) stage.canBeSkipped = stageDto.canBeSkipped;
          if (stageDto.canBeReentered !== undefined) stage.canBeReentered = stageDto.canBeReentered;
          
          await queryRunner.manager.save(stage);
          
          // Traiter les sous-stages
          if (stageDto.subStages !== undefined) {
            await this.updateSubStages(queryRunner, stage, stageDto.subStages);
          }
          
          processedStageIds.add(stage.id);
        } else {
          // ✅ Créer un nouveau stage
          stage = this.stageRepository.create({
            templateId: id,
            name: stageDto.name ?? '',
            description: stageDto.description ?? '',
            order: i,
            canBeSkipped: stageDto.canBeSkipped ?? false,
            canBeReentered: stageDto.canBeReentered ?? true,
          });
          await queryRunner.manager.save(stage);
          
          // Créer les sous-stages si fournis
          if (stageDto.subStages !== undefined && stageDto.subStages.length > 0) {
            for (let j = 0; j < stageDto.subStages.length; j++) {
              const subStageDto = stageDto.subStages[j];
              const subStage = this.subStageRepository.create({
                stageId: stage.id,
                name: subStageDto.name ?? '',
                description: subStageDto.description ?? '',
                order: subStageDto.order ?? j,
                isMandatory: subStageDto.isMandatory ?? true,
              });
              await queryRunner.manager.save(subStage);
            }
          }
          
          // Ne pas ajouter à processedStageIds car c'est un nouveau stage
        }
      }
      
      // Optionnel : Supprimer les stages qui n'ont pas été traités
      // Si vous voulez supprimer les stages non mentionnés, décommentez ce bloc
      
      for (const [stageId, stage] of existingStagesMap) {
        if (!processedStageIds.has(stageId)) {
          await queryRunner.manager.delete(Stage, stageId);
        }
      }
      
    }

    await queryRunner.commitTransaction();
    return this.findOne(id);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// Méthode helper pour mettre à jour les sous-stages
private async updateSubStages(
  queryRunner: QueryRunner,
  stage: Stage,
  subStageDtos: UpdateSubStageDto[]
): Promise<void> {
  // Créer une Map des sous-stages existants
  const existingSubStagesMap = new Map(
    (stage.subStages || []).map(ss => [ss.id, ss])
  );
  
  const processedSubStageIds = new Set<string>();
  
  for (let j = 0; j < subStageDtos.length; j++) {
    const subStageDto = subStageDtos[j];
    
    // Déterminer si c'est une sous-étape existante
    const isExisting = subStageDto.id 
      && !subStageDto.id.startsWith('temp-')
      && existingSubStagesMap.has(subStageDto.id);
    
    if (isExisting) {
      // Mettre à jour la sous-étape existante
      if (!subStageDto.id) {
        throw new Error('SubStage id is required');
      }

      const subStage = existingSubStagesMap.get(subStageDto.id)!;
      
      if (subStageDto.name !== undefined) subStage.name = subStageDto.name;
      if (subStageDto.description !== undefined) subStage.description = subStageDto.description;
      if (subStageDto.order !== undefined) subStage.order = subStageDto.order;
      if (subStageDto.isMandatory !== undefined) subStage.isMandatory = subStageDto.isMandatory;
      
      await queryRunner.manager.save(subStage);
      processedSubStageIds.add(subStage.id);
    } else {
      // Créer une nouvelle sous-étape
      const subStage = this.subStageRepository.create({
        stageId: stage.id,
        name: subStageDto.name ?? '',
        description: subStageDto.description ?? '',
        order: subStageDto.order ?? j,
        isMandatory: subStageDto.isMandatory ?? true,
      });
      await queryRunner.manager.save(subStage);
    }
  }
  
  // Optionnel : Supprimer les sous-stages non mentionnées
  /*
  for (const [subStageId, subStage] of existingSubStagesMap) {
    if (!processedSubStageIds.has(subStageId)) {
      await queryRunner.manager.delete(SubStage, subStageId);
    }
  }
  */
}



  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepository.remove(template);
  }

  async duplicate(id: string, newName: string): Promise<ProcedureTemplate> {
    const original = await this.findOne(id);
    
    // Créer un nouveau template avec les mêmes données
    const newTemplate = this.templateRepository.create({
      name: newName,
      description: original.description,
      version: original.version + 1,
      isActive: true,
    });
    
    await this.templateRepository.save(newTemplate);
    
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
      await this.stageRepository.save(newStage);
      
      // Dupliquer les sous-stages
      for (const subStage of stage.subStages) {
        const newSubStage = this.subStageRepository.create({
          stageId: newStage.id,
          name: subStage.name,
          description: subStage.description,
          order: subStage.order,
          isMandatory: subStage.isMandatory,
        });
        await this.subStageRepository.save(newSubStage);
      }
    }
    
    return this.findOne(newTemplate.id);
  }

  async toggleActive(id: string, isActive: boolean): Promise<ProcedureTemplate> {
    const template = await this.findOne(id);
    template.isActive = isActive;
    await this.templateRepository.save(template);
    return this.findOne(id);
  }
}