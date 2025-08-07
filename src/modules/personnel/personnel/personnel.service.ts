import { BaseService } from 'src/core/shared/services/search/base.service';
import { CustomersService } from 'src/modules/customer/customer/customer.service';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
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
    private readonly type_personnel_service: TypePersonnelService,
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

  async findOne(id: number): Promise<Personnel> {
    const entity = await this.personnel_repository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Personnel not found1');
    return entity;
  }
  async findOneByCode(code: string): Promise<Personnel> {
    const entity = await this.personnel_repository.findOne({ where: { code }, relations: ['customer', 'type_personnel', 'savings_account'] });
    if (!entity) throw new NotFoundException('Personnel not found2');
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
      customer: await this.customer_service.findOne(dto.customer_id ?? entity.customer.id),
      type_personnel: await this.type_personnel_service.findOne(dto.type_personnel_id ?? entity.type_personnel.id),
    });
    return this.personnel_repository.save(merged);
  }

  async findAllExceptCommercialAndPartner(): Promise<Personnel[]> {
    return this.personnel_repository
      .createQueryBuilder('personnel')
      .innerJoinAndSelect('personnel.type_personnel', 'type')
      .where('type.code NOT IN (:...excluded)', {
        excluded: [PersonnelTypeCode.COMMERCIAL, PersonnelTypeCode.PARTNER],
      })
      .getMany();
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    await this.personnel_repository.remove(entity);
  }
}
