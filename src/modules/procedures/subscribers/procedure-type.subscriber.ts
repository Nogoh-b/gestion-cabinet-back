import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseEntitySubscriber } from 'src/core/subscribers/base-entity.subscriber';
import { DataSource, InsertEvent, Repository } from 'typeorm';

import { ProcedureType } from '../entities/procedure.entity';

/**
 * Génère uniquement le code technique d'un type de procédure.
 *
 * L'association à une version publiée du template est une décision métier
 * explicite. Elle ne doit jamais créer, dupliquer ou publier un template par
 * effet de bord lors de l'insertion d'un référentiel.
 */
@Injectable()
export class ProcedureTypeSubscriber extends BaseEntitySubscriber<ProcedureType> {
  constructor(
    dataSource: DataSource,
    @InjectRepository(ProcedureType)
    private readonly typeRepository: Repository<ProcedureType>,
  ) {
    super(dataSource);
  }

  listenTo() {
    return ProcedureType;
  }

  protected async onBeforeCreate(
    entity: ProcedureType,
    _event: InsertEvent<ProcedureType>,
  ): Promise<void> {
    if (!entity.code && entity.name) {
      entity.code = await this.generateUniqueCode(entity.name);
    }
  }

  private async generateUniqueCode(name: string): Promise<string> {
    const stopWords = new Set([
      'de',
      'du',
      'des',
      'la',
      'le',
      'les',
      'et',
      'ou',
      'en',
      'au',
      'aux',
      'un',
      'une',
    ]);
    const baseCode =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 1 && !stopWords.has(word.toLowerCase()))
        .slice(0, 3)
        .map((word) => word.slice(0, 5))
        .join('-')
        .slice(0, 50) || 'PROCEDURE';

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const code = `${baseCode.slice(0, 50 - suffix.length)}${suffix}`;
      const existing = await this.typeRepository.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new Error("Impossible de générer un code de procédure unique");
  }
}
