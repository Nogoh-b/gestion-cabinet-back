import { PaginationQueryTxDto } from 'src/core/shared/dto/pagination-query.dto';
import { PaginatedResult } from 'src/core/shared/interfaces/pagination.interface';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { CustomersService } from 'src/modules/customer/customer/customer.service';
import { DocumentCustomerService } from 'src/modules/documents/document-customer/document-customer.service';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';




import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';
import { Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';





import { InjectRepository } from '@nestjs/typeorm';





import { PersonnelTypeCode } from '../type_personnel/entities/type_personnel.entity';
import { TypePersonnelService } from '../type_personnel/type_personnel.service';
import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { UpdatePersonnelDto } from './dto/update-personnel.dto';
import { Personnel } from './entities/personnel.entity';













@Injectable()
export class PersonnelService extends BaseService<Personnel> {
  constructor(
    @InjectRepository(Personnel)
    private readonly personnel_repository: Repository<Personnel>,
    @Inject(forwardRef(() => SavingsAccountService))
    private readonly savings_account_service: SavingsAccountService,
    @Inject(forwardRef(() => CustomersService))
    private readonly customer_service: CustomersService,
    @Inject(forwardRef(() => TransactionSavingsAccountService))
    private readonly transactionSavingsAccountService: TransactionSavingsAccountService,
    private readonly type_personnel_service: TypePersonnelService,
    private readonly documentCustomerService: DocumentCustomerService,
  ) {
    super();
    console.log(forwardRef);
  }

  getRepository(): Repository<Personnel> {
    return this.personnel_repository;
  }

  async create(dto: CreatePersonnelDto): Promise<Personnel> {
    const type = await this.type_personnel_service.findOne(dto.type_personnel_id);
    const customer = await this.customer_service.findOne(dto.customer_id);

    // Toujours récupérer le compte épargne en ligne
    const savings_account = await this.savings_account_service.findFirstOnlineByCustomer(dto.customer_id);
    if (!savings_account) throw new NotFoundException('Associated savings account not found');

    let code: any = null;

    if (type.code === PersonnelTypeCode.COMMERCIAL) {
      const max = await this.personnel_repository
        .createQueryBuilder('personnel')
        .innerJoin('personnel.type_personnel', 'type')
        .where("type.code = :code", { code: PersonnelTypeCode.COMMERCIAL })
        .andWhere("personnel.code REGEXP '^[0-9]+$'")
        .select('MAX(CAST(personnel.code AS UNSIGNED))', 'max')
        .getRawOne();

      code = (parseInt(max?.max || '0') + 1).toString().padStart(4, '0');

    } else if (type.code === PersonnelTypeCode.PARTNER) {
      code = dto.code;

    }

    const entity = this.personnel_repository.create({
      customer,
      savings_account,
      type_personnel: type,
      name : dto.name,
      is_intern : dto.is_intern,
    });
    if(code)
      entity.code = code;

    return this.personnel_repository.save(entity);
  }


  async findAll(): Promise<Personnel[]> {
    return this.personnel_repository.find({
      relations: ['customer', 'type_personnel', 'savings_account'],
    });
  }

  async findAllMembersLength(personnels: Personnel[]): Promise<number> {
    let count = 0
    for (const personnel of personnels) {
      if (personnel.type_personnel.code === PersonnelTypeCode.MEMBRE) {
        count++;
      }
    }
    return count;
  }

  async findOne(id: number): Promise<Personnel> {
    const entity = await this.personnel_repository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Personnel not found1');
    return entity;
  }

  async findOneByCode(code: string): Promise<Personnel> {
    const entity = await this.personnel_repository.findOne({ where: { code }, relations: ['customer', 'type_personnel', 'savings_account'] });
    if (!entity) throw new NotFoundException('Personnel not found2 ', code); 
    return entity;
  }

  async update(id: number, dto: UpdatePersonnelDto): Promise<Personnel> {
        const max = await this.personnel_repository
      .createQueryBuilder('personnel')
      .select('MAX(personnel.commercial_code)', 'max') 
      .getRawOne();

    const next_code = (parseInt(max?.max || '0') + 1).toString().padStart(4, '0');

    const entity = await this.findOne(id);
    const merged = this.personnel_repository.merge(entity, {
      code: dto.code ? next_code : undefined,
      is_intern: dto.is_intern,
      customer: await this.customer_service.findOne(dto.customer_id ?? entity.customer.id),
      type_personnel: await this.type_personnel_service.findOne(dto.type_personnel_id ?? entity.type_personnel.id),
    });
    return this.personnel_repository.save(merged);
  }

  async findAllExceptCommercialAndPartner(): Promise<Personnel[]> {
    return this.personnel_repository
      .createQueryBuilder('personnel')
      .innerJoinAndSelect('personnel.type_personnel', 'type')
      .innerJoinAndSelect('personnel.savings_account', 'savings_account')
      .where('type.code NOT IN (:...excluded)', {
        excluded: [PersonnelTypeCode.COMMERCIAL, PersonnelTypeCode.PARTNER],
      })
      .getMany();
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    await this.personnel_repository.remove(entity);
  }

  async getPersonnelTransactions(id,query: PaginationQueryTxDto): Promise<PaginatedResult<TransactionSavingsAccount>> {
      const { page, limit, term, fields, exact, from, to, type, txType } = query;
      const fieldList = fields ? fields.split(',') : undefined;
      const isExact = exact ;
      return this.transactionSavingsAccountService.findAll(      
        page ? +page : undefined,
        limit ? +limit : undefined,
        term,
        fieldList,
        isExact,
        from ? new Date(from).toISOString() : undefined,
        to ? new Date(to).toISOString() : undefined, {personnel_id: id});
  }

  async unlockIfMaxReached(personnel_id: number): Promise<number> {
    const personnel = await this.findOne(personnel_id);
    return await this.transactionSavingsAccountService.unlockTransactionForPersonnel(personnel.id, personnel?.savings_account?.id, personnel.type_personnel.max_transaction_blocked );
  }

  async checkCode(code: string, type_personnel : PersonnelTypeCode): Promise<any> {
    const personnel = await this.personnel_repository.findOne({where: { code }, relations: ['type_personnel','savings_account','savings_account.type_savings_account']});
    if (!personnel || personnel.type_personnel.code !== type_personnel) {
      throw new NotFoundException(`${type_personnel} ${code} introuvable`);
    }
    const doc = await this.documentCustomerService.findByType('PHOTO 4X4')
    const {name} = personnel
    let  file_path = ''
    if(doc)
      file_path = doc.file_path
      let promo_code_reduction 
      console.log('type_personnel', personnel.savings_account.type_savings_account)
      if(type_personnel === PersonnelTypeCode.PARTNER)
        promo_code_reduction = personnel.savings_account.type_savings_account.promo_code_reduction
    return {name, promo_code_reduction, file_path};
  }

}
