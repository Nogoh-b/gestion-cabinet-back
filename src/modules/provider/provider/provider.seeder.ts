import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { Provider } from './entities/provider.entity';






@Injectable()
export class ProviderSeeder {
  constructor(
    @InjectRepository(Provider)
    private readonly providerRepo: Repository<Provider>,
  ) {}

  async seed() {
    const types: Partial<Provider>[] = [
      {
        code: 'MOMO',
        name: 'Dépôt MOMO',
        status: 1,
      },


      {
        code: 'OM',
        name: 'Dépôt OM',
        status: 1,
      },
      
      {
        code: 'HYBRID_SAVING',
        name: 'HYBRID SAVING ACCOUNT',
        status: 1,
      }
    ];

    for (const type of types) {
      console.log(`Seeding transaction type: ${type.code}`);
      const exists = await this.providerRepo.findOne({
        where: { code: type.code },
      });
      if (!exists) {
        const entity = this.providerRepo.create(type);
        await this.providerRepo.save(entity);
        console.log(`✔ Inserted: ${type.code}`);
      } else {
        console.log(`→ ${type.code} already exists, skipping`);
      }
    }
  }
}
