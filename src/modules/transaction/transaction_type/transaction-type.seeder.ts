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
        name: 'Paiment Commercial',
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
      {
        code: 'COMMISSION_CASH_OM_MFINANCE',
        name: 'Commission Cash OM MFINANCE',
        description: 'Commission sur les transactions Cash OM MFINANCE',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'COMMISSION_CASH_MOMO',
        name: 'Commission Cash MOMO',
        description: 'Commission sur les transactions Cash MOMO',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },
      {
        code: 'COMMISSION_CASH_OM',
        name: 'Commission Cash OM',
        description: 'Commission sur les transactions Cash OM',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },


      {
        code: 'COMMISSION_CASH_MOMO_MFINANCE',
        name: 'Commission Cash MOMO MFINANCE',
        description: 'Commission sur les transactions Cash MOMO MFINANCE',
        is_credit: 0,
        fee_percentage: 0.0,
        status: 1,
      },
      
      {
        code: 'COMMISSION_PERSONNEL',
        name: 'Commission PERSONNEL',
        description: 'Commission sur les transactions reverssé au personnel',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },  


      {
        code: 'BUY_TONTINE',
        name: 'Paiement de tontine',
        description: 'Paiement d\'une tontine dans COTI',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },      
         
      {
        code: 'RECEIVE_TONTINE',
        name: 'Reception de tontine',
        description: 'Reception d\'une tontine dans COTI',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },         
      {
        code: 'BUY_SAVING_PROJECT',
        name: 'Paiement pour un projet d\'épargne',
        description: 'Paiement d\'une épargne dans le cadre d\'un projet',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },         
      {
        code: 'BUY_PENALITY_SAVING_PROJECT',
        name: 'Paiement de penalité pour un projet d\'épargne',
        description: 'Paiement d\'une pénalité dans le cadre d\'un projet',
        is_credit: 1,
        fee_percentage: 0.0,
        status: 1,
      },

      {
        "code": "PROJET_DEPOSIT",
        "name": "Dépôt sur projet",
        "description": "Dépôt effectué dans un projet via COTI",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      },
      {
        "code": "DEPOSIT_LOANS",
        "name": "Prêt de projet",
        "description": "Prêt accordé dans le cadre d’un projet via COTI",
        "is_credit": 0,
        "fee_percentage": 0.0,
        "status": 1
      },

      {
        "code": "LOANS_REPAYMENT",
        "name": "Remboursement de prêt de projet",
        "description": "Remboursement effectué pour un prêt de projet",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      }, 

      {
        "code": "BUY_SALARY",
        "name": "Paiement de salaire",
        "description": "Paiement de salaire via COTI",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      },
      /*{
        "code": "PROJET_STANDARD",
        "name": "Projet standard",
        "description": "Transaction standard dans le cadre d’un projet",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      },
      {
        "code": "PROJET_TONTINE",
        "name": "Projet tontine",
        "description": "Transaction liée à une tontine dans un projet via COTI",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      },
      {
        "code": "PROJET_SALE",
        "name": "Vente de projet",
        "description": "Vente réalisée dans le cadre d’un projet",
        "is_credit": 1,
        "fee_percentage": 0.0,
        "status": 1
      }*/

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
