// src/modules/procedures/services/procedure-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcedureCategoryDto, ProcedureStatsDto } from './dto/procedure-stats.dto';
import { ProcedureType } from './entities/procedure.entity';

@Injectable()
export class ProcedureStatsService {
  constructor(
    @InjectRepository(ProcedureType)
    private procedureRepository: Repository<ProcedureType>,
  ) {}

  async getStats(): Promise<ProcedureStatsDto> {
    const total = await this.procedureRepository.count();
    const mainTypes = await this.procedureRepository.count({ where: { is_subtype: false } });
    const subTypes = await this.procedureRepository.count({ where: { is_subtype: true } });
    const active = await this.procedureRepository.count({ where: { is_active: true } });

    // Stats par catégorie
    const procedures = await this.procedureRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.subtypes', 'subtype')
      .leftJoinAndSelect('p.dossiers', 'dossier')
      .leftJoinAndSelect('p.parent', 'parent')
      .getMany();

    const categories = new Map<string, ProcedureCategoryDto>();
    
    procedures.forEach(p => {
      const category = p.category || 'Autre';
      if (!categories.has(category)) {
        categories.set(category, {
          category,
          count: 0,
          subtypes: 0,
          dossiers: 0,
        });
      }
      
      const cat = categories.get(category);
      cat!.count++;
      cat!.subtypes += p.subtypes?.length || 0;
      cat!.dossiers += p.dossiers?.length || 0;
    });

    // Procédures les plus utilisées
    const mostUsed = await this.procedureRepository
      .createQueryBuilder('p')
      .leftJoin('p.dossiers', 'dossier')
      .leftJoin('p.parent', 'parent')
      .select('p.id', 'id')
      .addSelect('p.name', 'name')
      .addSelect('p.code', 'code')
      .addSelect('p.is_subtype', 'isSubtype')
      .addSelect('parent.name', 'parentName')
      .addSelect('COUNT(dossier.id)', 'dossiersCount')
      .groupBy('p.id')
      .addGroupBy('parent.name')
      .orderBy('dossiersCount', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      total,
      mainTypes,
      subTypes,
      active,
      byCategory: Array.from(categories.values()),
      mostUsed: mostUsed.map(m => ({
        id: m.id,
        name: m.name,
        code: m.code,
        dossiersCount: parseInt(m.dossiersCount || 0),
        isSubtype: m.isSubtype === 1,
        parentName: m.parentName,
      })),
    };
  }
}