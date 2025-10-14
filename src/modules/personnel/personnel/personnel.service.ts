import { plainToInstance } from 'class-transformer';
import { PaginationQueryTxDto } from 'src/core/shared/dto/pagination-query.dto';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
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
    private paginationService: PaginationService,
    private readonly documentCustomerService: DocumentCustomerService,
  ) {
    super();
    console.log(forwardRef);
  }

  getRepository(): Repository<Personnel> {
    return this.personnel_repository;
  }

  async create(dto: CreatePersonnelDto): Promise<Personnel | any> {
    const type = await this.type_personnel_service.findOne(dto.type_personnel_id);
    const customer = await this.customer_service.findOne(dto.customer_id);

    // Toujours récupérer le compte épargne en ligne
    const savings_account = await this.savings_account_service.findFirstOnlineByCustomer(dto.customer_id);
    if (!savings_account) throw new NotFoundException('Associated savings account online not found');
    console.log(dto)
    let code: any = null;
    let sub_code: any = dto.sub_code ?? null;
    if(dto.sub_code){
      if(type.code != PersonnelTypeCode.COMMERCIAL)
        sub_code = null
    }

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
    if(type.code == PersonnelTypeCode.DG || type.code == PersonnelTypeCode.PCA){
      const personnelsToDisable = await this.personnel_repository
      .createQueryBuilder('p')
      .innerJoin('p.type_personnel', 't', 't.code = :code AND t.deleted_at IS NULL', { code: type.code })
      // .where('p.deleted_at IS NULL')
      .getMany( );
        // 2. Désactiver chaque personnel un par un
        for (const personnel of personnelsToDisable) {
          personnel.status = 0; // ou false selon votre modèle
          personnel.updated_at = new Date();
          
          await this.personnel_repository.save(personnel);
        }

    }

    const entity = this.personnel_repository.create({
      customer : customer as any,
      savings_account,
      type_personnel: type,
      name : dto.name,
      sub_code,
      status : 1,
      is_intern : dto.is_intern,
    });
    if(code)
      entity.code = code;

    return this.personnel_repository.save(entity);
  }


  async findAll(
    status = 1,
    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string
  ): Promise<PaginatedResult<Personnel>> {
    const qb = this.personnel_repository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.customer', 'customer')
      .leftJoinAndSelect('p.type_personnel', 'type')
      .leftJoinAndSelect('p.savings_account', 'sa')

    // Filtre statut (désactivation)
    if (status) {
      qb.andWhere('p.status = :status', { status });
    }

    // Options de pagination / recherche / plage de dates
    const options: PaginationOptions & {
      search?: SearchOptions;
      dateRange?: DateRange;
    } = { page, limit };

    if (term) {
      options.search = { term, fields, exact };
    }

    if (from || to) {
      options.dateRange = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
    }

    const paginatedResult = await this.paginationService.paginate<Personnel>(qb, options);

    const data = paginatedResult.data.map((personnel) =>
      plainToInstance(Personnel, personnel),
    );

    return {
      ...paginatedResult,
      data,
    };
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

  async findOne(id: number, strict =true): Promise<Personnel | null> {
    const entity = await this.personnel_repository.findOne({ where: { id } , relations: ['customer', 'type_personnel', 'savings_account']  });
    if (!entity && strict) throw new NotFoundException('Personnel not found1');
    if (entity && entity.status == 0 && strict) throw new NotFoundException('Personnel desactivé');
    return entity;
  }

  async findOneByCode(code: string, strict = true): Promise<Personnel | null> {
    const entity = await this.personnel_repository.findOne({
      where: { code, status: 1 },
      relations: ['customer', 'type_personnel', 'savings_account'],
      order: { updated_at: 'DESC', id: 'DESC' }
    });
    if (!entity  && strict) throw new NotFoundException('Personnel not found2 ', code); 
    if (entity && entity.status == 0 && strict) throw new NotFoundException('Personnel desactivé');
    return entity;
  }

  async update(id: number, dto: UpdatePersonnelDto): Promise<Personnel> {
        const max = await this.personnel_repository
      .createQueryBuilder('personnel')
      .select('MAX(personnel.commercial_code)', 'max') 
      .getRawOne();

    const next_code = (parseInt(max?.max || '0') + 1).toString().padStart(4, '0');

    const entity = await this.findOne(id);

    if (!entity) throw new NotFoundException('Personnel inexistante');
    const merged = this.personnel_repository.merge(entity, {
      code: dto.code ? next_code : undefined,
      is_intern: dto.is_intern,
      status: dto.status,
      customer: await this.customer_service.findOne(dto.customer_id ?? entity.customer.id) as any,
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
      .andWhere('personnel.status = :status', { status: 1 })
      .getMany();

  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new NotFoundException('Personnel not found'); 
      
    await this.personnel_repository.remove(entity);
  }

  async activate(id: number): Promise<Personnel> {
    const personnel = await this.personnel_repository.findOne({
      where: { id, status: 0 },
    });
    if (!personnel) throw new NotFoundException('Personnel inexistant ou actif');
    personnel!.status = 1;
    personnel?.save();
    return personnel;
  }
  async deactivate(id: number): Promise<Personnel> {
    const personnel = await this.personnel_repository.findOne({
      where: { id, status: 1 },
    });
    if (!personnel) throw new NotFoundException('Personnel inexistante ou deja inactif');
    personnel!.status = 0;
    personnel?.save();
    return personnel;
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
    if (!personnel) throw new NotFoundException('Personnel not found'); 

    return await this.transactionSavingsAccountService.unlockTransactionForPersonnel(personnel.id, personnel?.savings_account?.id, personnel.type_personnel.max_transaction_blocked );
  }

  async checkCode(code: string, type_personnel : PersonnelTypeCode): Promise<any> {
    const personnel = await this.personnel_repository.findOne({where: { code }, relations: ['type_personnel','savings_account','savings_account.type_savings_account','customer']});
    if (!personnel || personnel.type_personnel.code !== type_personnel) {
      throw new NotFoundException(`${type_personnel} ${code} introuvable`);
    }
    if (personnel && personnel.type_personnel.code == type_personnel && personnel.status == 0) {
      throw new NotFoundException(`${type_personnel} ${code} desactivé`);
    }
    const doc = await this.documentCustomerService.findByTypeId(personnel.customer.id)
    let {name} = personnel
    if((!name || name === '') && personnel.customer)
      name = `${personnel.customer.first_name} ${personnel.customer.last_name}`
    let  file_path = ''
    if(doc)
      file_path = ''//`${process.env.API_HOST || 'localhost:3004'}/${UPLOAD_FOLDER_NAME}/${UPLOAD_DOCS_FOLDER_NAME}/${doc.file_path}` 
      let promo_code_reduction 
      console.log('type_personnel', personnel.savings_account.type_savings_account)
      if(type_personnel === PersonnelTypeCode.PARTNER)
        promo_code_reduction = personnel.savings_account.type_savings_account.promo_code_reduction
    return {name, promo_code_reduction, file_path, code};
  }

}
