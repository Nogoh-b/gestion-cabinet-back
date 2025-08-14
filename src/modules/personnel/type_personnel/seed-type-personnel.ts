// type-personnel.seeder.ts
import { Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { PersonnelTypeCode, TypePersonnel } from './entities/type_personnel.entity';


@Injectable()
export class TypePersonnelSeeder {
  private readonly logger = new Logger(TypePersonnelSeeder.name);

  constructor(
    @InjectRepository(TypePersonnel)
    private readonly repository: Repository<TypePersonnel>,
  ) {}

  async seed(): Promise<void> {
    try {
      const types = [
        { title: 'Directeur Général', code: PersonnelTypeCode.DG, max_transaction_blocked: 100 },
        { title: 'Président du Conseil d\'Administration', code: PersonnelTypeCode.PCA, max_transaction_blocked: 100 },
        { title: 'Membre', code: PersonnelTypeCode.MEMBRE, max_transaction_blocked: 10 },
        { title: 'Partenaire', code: PersonnelTypeCode.PARTNER, max_transaction_blocked: 50 },
        { title: 'Commercial', code: PersonnelTypeCode.COMMERCIAL, max_transaction_blocked: 25 },
      ];

      for (const type of types) {
        const exists = await this.repository.findOne({ where: { code: type.code } });
        if (!exists) {
          await this.repository.save(this.repository.create(type));
        }
      }

      this.logger.log('Seeding completed successfully');
    } catch (error) {
      this.logger.error('Failed to seed personnel types', error.stack);
      throw error;
    }
  }
}