import { TransactionType } from 'src/modules/transaction/transaction_type/entities/transaction_type.entity';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';









@Injectable()
export class TransactionTypeSeeder {
  constructor(
    @InjectRepository(TransactionType)
    private readonly transactionTypeRepo: Repository<TransactionType>,
  ) {}

  async seed() {
    const types: Partial<TransactionType>[] = [
      {
        code: 'MOMO_DEPOSIT',
        name: 'Dépôt MOMO',
        description: 'Versement dans portefeuille mobile Mobile Money',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'OPENING_FEE',
        name: 'Frais d\'ouverture de compte',
        description: 'Frais déduit pour l\'ouverture de compte',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'PARTNER_COMMISSION',
        name: 'Paiment Partenaire',
        description: 'Versement dans Compte partenaire de la comission',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'COMMERCIAL_COMMISSION',
        name: 'Paiment Partenaire',
        description: 'Versement dans Compte Commercial de la comission',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'OM_DEPOSIT',
        name: 'Dépôt OM',
        description: 'Versement dans portefeuille mobile Orange Money',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'MOMO_WITHDRAW',
        name: 'Retrait MOMO',
        description: 'Retrait du portefeuille mobile Mobile Money',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'OM_WITHDRAW',
        name: 'Retrait OM',
        description: 'Retrait du portefeuille mobile Orange Money',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'RESSOURCE_BUY',
        name: 'Payment D\'une resource',
        description: 'Souscription à une resource',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
    ];

    for (const type of types) {
      console.log(`Seeding transaction type: ${type.code}`);
      const exists = await this.transactionTypeRepo.findOne({
        where: { code: type.code },
      });
      if (!exists) {
        const entity = this.transactionTypeRepo.create(type);
        await this.transactionTypeRepo.save(entity);
        console.log(`✔ Inserted: ${type.code}`);
      } else {
        console.log(`→ ${type.code} already exists, skipping`);
      }
    }
  }
}
