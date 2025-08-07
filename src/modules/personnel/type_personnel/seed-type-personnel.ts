import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';



import { PersonnelTypeCode, TypePersonnel } from './entities/type_personnel.entity';




export class TypePersonnelSeeder {
  constructor(    @InjectRepository(TypePersonnel)
      private readonly repository: Repository<TypePersonnel>,) {}

  async seed(): Promise<void> {

    const types: { title: string; code: PersonnelTypeCode; max_transaction_blocked: number }[] = [
      { title: 'Directeur Général', code: PersonnelTypeCode.DG, max_transaction_blocked: 100 },
      { title: 'Président du Conseil d’Administration', code: PersonnelTypeCode.PCA, max_transaction_blocked: 100 },
      { title: 'Membre', code: PersonnelTypeCode.MEMBRE, max_transaction_blocked: 10 },
      { title: 'Partenaire', code: PersonnelTypeCode.PARTNER, max_transaction_blocked: 50 },
      { title: 'Commercial', code: PersonnelTypeCode.COMMERCIAL, max_transaction_blocked: 25 },
    ];

    for (const type of types) {
      const exists = await this.repository.findOne({ where: { code: type.code } });
      if (!exists) {
        const record = this.repository.create({
          title: type.title,
          code: type.code,
          max_transaction_blocked: type.max_transaction_blocked,
        });
        await this.repository.save(record);
      }
    }

    console.log('✅ TypePersonnelSeeder: seeding completed');
  }
}
