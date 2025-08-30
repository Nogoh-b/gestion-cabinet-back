import { Queue } from 'bull';
import { plainToInstance } from 'class-transformer';
import {
  DateRange,
  PaginatedResult,
  PaginationOptions,
  SearchOptions,
} from 'src/core/shared/interfaces/pagination.interface';
import { McotiService } from 'src/core/shared/services/mCoti/mcoti.service';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';

import { Personnel } from 'src/modules/personnel/personnel/entities/personnel.entity';
import { PersonnelService } from 'src/modules/personnel/personnel/personnel.service';

import { PersonnelTypeCode } from 'src/modules/personnel/type_personnel/entities/type_personnel.entity';

import { ProviderService } from 'src/modules/provider/provider/provider.service';
import { QueueService } from 'src/modules/queue/queue.service';
import { Ressource } from 'src/modules/ressource/ressource/entities/ressource.entity';

import {
  SavingsAccount,
  SavingsAccountStatus,
} from 'src/modules/savings-account/savings-account/entities/savings-account.entity';

import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { Not, Repository, SelectQueryBuilder } from 'typeorm';

import { v4 as uuidv4 } from 'uuid';

import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';







































































































import { ChannelTransaction } from '../chanel-transaction/entities/channel-transaction.entity';
import {
  TransactionChannel,
  TransactionCode,
  TransactionProvider,
  TransactionType,
} from '../transaction_type/entities/transaction_type.entity';
import { TransactionTypeService } from '../transaction_type/transaction_type.service';
import {
  CreateCreditTransactionSavingsAccountDto,
  CreateDebitTransactionSavingsAccountDto,
  CreateTransactionSavingsAccountDto,
  UpdateProviderInfoDto,
} from './dto/create-transaction_saving_account.dto';
import { ResponseTransactionSavingsAccountDto } from './dto/response-transaction_saving_account.dto';
import { Sequence } from './entities/sequence.entity';
import { Payment, PaymentStatus, PaymentStatusProvider, TransactionSavingsAccount, TransactionSavingsAccountStatus } from './entities/transaction_saving_account.entity';







































































































@Injectable()
export class TransactionSavingsAccountService {
  constructor(
    @InjectRepository(TransactionSavingsAccount)
    private readonly repo: Repository<TransactionSavingsAccount>,
    @InjectRepository(ChannelTransaction)
    private readonly channelRepo: Repository<ChannelTransaction>,
    private readonly savingsAccountService: SavingsAccountService,
    private readonly providerService: ProviderService,
    private readonly transactionTypeService: TransactionTypeService,
    private paginationService: PaginationService,
    public mcotiService: McotiService,
    // public partnerService: PartnerService,
    // public commissionService: CommercialService,
    public personnelService: PersonnelService,
    @InjectQueue('maintenance')
    private readonly maintenanceQueue: Queue,
    private readonly queueService: QueueService,
  ) {}

  async perform_transaction(
    dto:
      | CreateCreditTransactionSavingsAccountDto
      | CreateTransactionSavingsAccountDto
      | CreateDebitTransactionSavingsAccountDto,
    type_code: string,
    channel_code: string,
    provider_code: string,
    to_agency = false,
  ): Promise<ResponseTransactionSavingsAccountDto> {
    // channel_code = dto.branch_id ? 'BRANCH' : 'MOBILE'

    if (
      (dto as CreateTransactionSavingsAccountDto)
        .origin_savings_account_code === dto.target_savings_account_code
    ) {
      throw new BadRequestException(`Transfert vers le même compte interdit ${(dto as CreateTransactionSavingsAccountDto).origin_savings_account_code} ${dto.target_savings_account_code} `);
    }
    console.log('isFirstTx111');

    // récupération du compte origine
    let origin: SavingsAccount | null = null;
    if (
      (dto as CreateTransactionSavingsAccountDto).origin_savings_account_code
    ) {
      origin = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCodeV1(
          (dto as CreateTransactionSavingsAccountDto)
            .origin_savings_account_code,
        ),
      );
    } else if (
      !(dto as CreateTransactionSavingsAccountDto)
        .origin_savings_account_code &&
      to_agency
    ) {
      origin = await this.savingsAccountService.findOneAdmin(dto.branch_id);
    }
    if (
      !origin &&
      (dto as CreateTransactionSavingsAccountDto).origin_savings_account_code
    ) {
      throw new NotFoundException(
        `Compte épargne introuvable pour code : ${(dto as CreateTransactionSavingsAccountDto).origin_savings_account_code}`,
      );
    }

    // récupération du compte cible
    let target: SavingsAccount | null = null; // Initialisation explicite à null
    if (dto.target_savings_account_code) {
      target = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCodeV1(
          dto.target_savings_account_code ?? '0',
        ),
      );
    } else if (!dto.target_savings_account_code) {
      // target = await this.savingsAccountService.findOneAdmin(dto.branch_id)
    }
    if (!target && dto.target_savings_account_code) {
      throw new NotFoundException(
        `Compte cible introuvable pour code : ${dto.target_savings_account_code}`,
      );
    }

    // récupération du type, du canal et du provider et ressource
    const txType = await this.transactionTypeService.findOneByCode(type_code);
    if (!txType) {
      throw new NotFoundException(`Type transaction invalide : ${type_code}`);
    }
    let ressource: Ressource | null = null;
    if ((dto as CreateTransactionSavingsAccountDto).ressource_id)
      ressource = await this.savingsAccountService.getByIdAndSavingsAccount(
        (dto as CreateTransactionSavingsAccountDto).ressource_id,
        false,
      );

    const isFirstTx = await this.isFirstTransaction(target); //Verifie si c'est la première transaction
    console.log('isFirstTx111', isFirstTx);

    const channel = await this.channelRepo.findOne({
      where: { code: channel_code },
    });
    if (!channel) {
      throw new NotFoundException(`Canal invalide : ${channel_code}`);
    }

    const provider = await this.providerService.findOne(provider_code);
    if (!provider) {
      throw new NotFoundException(`Provider invalide : ${provider_code}`);
    }

    // Vérification des documents requis pour le compte cible et la transaction est accepté
    if (origin) {
      const docStatsTargetAccount =
        await this.savingsAccountService.getDocumentStatus(origin?.id);
      if (
        !docStatsTargetAccount.allRequiredValidated ||
        origin.status != SavingsAccountStatus.ACTIVE
      ) {
        if (this.can_refuse_transaction_type_for_debit(txType.code, origin.is_admin))
          throw new NotFoundException(
            `Tout vos documents ne sont pas validé et ou compte non actif : ${origin?.id}`,
          );
      }
    }

    const paymentCode = await this.generateUniquePaymentCode();
    const payment_token_provider =
      await this.generateUniquePaymentTokenProvider();
    const reference = this.formatTransactionReference(txType, provider.code);
    const dayBeforeWithdraw =
      (dto as CreateTransactionSavingsAccountDto).day_before_withdraw ?? 0;

    console.log(
      'dayBeforeWithdraw',
      (dto as CreateTransactionSavingsAccountDto).day_before_withdraw,
    );
    // création de l'entité transaction
    const tx = new TransactionSavingsAccount();
    tx.amount = dto.amount;
    tx.is_locked = dto.is_locked ?? false;
    tx.status =  0; 
    // tx.status =  origin && dayBeforeWithdraw === 0 ? 1 :0; 
    tx.branch_id = dto.branch_id ?? null; 
    tx.channelTransaction = channel;
    tx.provider = provider;
    tx.commission = dto.commission ?? 0;
    tx.transactionType = txType;
    tx.ressource = ressource;
    tx.tx_project_id = dto.tx_project_id ?? null;
    /*tx.origin = origin?.number_savings_account
      ? origin?.number_savings_account
      : 'SYTEM';*/
    tx.origin = dto.origin ?? origin?.number_savings_account ?? 'SYSTEM';
    tx.target = dto.target ??  target?.number_savings_account ?? 'SYSTEM';
    tx.originSavingsAccount = origin; //(dto  as CreateTransactionSavingsAccountDto).origin_savings_account_code ? origin : null;
    tx.targetSavingsAccount = target; // (dto  as CreateTransactionSavingsAccountDto).target_savings_account_code  ? target : null;
    tx.payment_code = paymentCode;
    tx.date_for_withdraw =
      dayBeforeWithdraw > 0
        ? new Date(Date.now() + dayBeforeWithdraw * 24 * 60 * 60 * 1000)
        : new Date();
    // tx.date_for_withdraw = (dto  as CreateTransactionSavingsAccountDto).day_before_withdraw ? new Date(Date.now() + (dto  as CreateTransactionSavingsAccountDto).day_before_withdraw * 24 * 60 * 60 * 1000) : new Date();
    tx.payment_token_provider = payment_token_provider;
    tx.reference = await reference;
    tx.token = dto.token ?? '986907875';

    // si c\'est la première transaction dans un compte
    if (isFirstTx && target) {
      const initial_deposit =
        await this.savingsAccountService.getInitialDeposit(
          target.type_savings_account,
        );
      if (initial_deposit > dto.amount)
        throw new BadRequestException(
          `Pour votre premier dépôt vous devez avoir au minimum ${initial_deposit} pour ce type de compte : ${target.type_savings_account.name} `,
        );
    }

    await this.repo.manager.transaction(async (entityManager) => {
      await this.validateTransaction(
        origin,
        target,
        dto.amount,
        target != null,
        txType.code,
      );
      await entityManager.save(tx);
    });
    /*if(!Boolean(txType.is_credit) || 
    (provider.code != TransactionProvider.MOMO && provider.code != TransactionProvider.OM ) || 
    txType.code === TransactionCode.INTERNAL_TRANSFER  ){    */
    // this.validate(tx.id, isFirstTx)
    // console.log('txxxxxxxx11 ', tx.targetSavingsAccount ,' ', tx.status)
    if (
      origin != null ||
      (provider.code != TransactionProvider.MOMO &&
        provider.code != TransactionProvider.OM) ||
        txType.code === TransactionCode.BUY_TONTINE ||
        txType.code === TransactionCode.RECEIVE_TONTINE ||
        txType.code === TransactionCode.INTERNAL_TRANSFER
    ) {
      this.validate(tx.id, isFirstTx);
      tx.status = 1;
    }
    const tx1 = await this.repo.save(tx);
    console.log('txxxxxxxx ', tx1.id, ' ', tx1.channelTransaction.code);

    return plainToInstance(ResponseTransactionSavingsAccountDto, tx);
  }

  can_refuse_transaction_type_for_debit(txTypeCode?: string, is_admin ?: boolean) {
    // if(tx.originSavingsAccount?.is_admin)
    return (
      txTypeCode === TransactionCode.INTERNAL_TRANSFER ||
      txTypeCode?.includes('_WITHDRAW') || !is_admin
    );
  }

  async buy_ressource(dto: CreateDebitTransactionSavingsAccountDto, channel) {
    const provider = channel === 'BRANCH' ? 'CASH' : channel;
    const channel_ = channel === 'BRANCH' ? 'BRANCH' : 'MOBILE';
    let saAdmin = new SavingsAccount();
    if (!dto.target_savings_account_code) {
      saAdmin = await this.savingsAccountService.findOneAdmin(dto.branch_id);
    }
    dto.target_savings_account_code = saAdmin.number_savings_account;
    return await this.perform_transaction(
      dto,
      'RESSOURCE_BUY',
      channel_,
      provider,
    );
  }
  async deposit_cash(dto: CreateCreditTransactionSavingsAccountDto) {
    /*const code_cash = await this.mcotiService.callMcotiEndpoint(
            'POST',
            `epargne/bank/operator/update-sold`,{provider:'OM', isCredit:1,  amount:175,}
        );
        console.log('sold updated', code_cash)
    return new TransactionSavingsAccount*/
    return await this.perform_transaction(
      dto,
      'CASH_DEPOSIT',
      'BRANCH',
      'CASH',
    );
  }

  async withdraw_cash(dto: CreateDebitTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'CASH_WITHDRAWAL',
      'BRANCH',
      'CASH',
    );
  }

  async deposit_cheque(dto: CreateCreditTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'CHEQUE_DEPOSIT',
      'BRANCH',
      'CHEQUE',
    );
  }

  async credit_interest(dto: CreateCreditTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'INTEREST_CREDIT',
      'API',
      'SYSTEM',
      true,
    );
  }

  async e_wallet_deposit(dto: CreateCreditTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'E_WALLET_DEPOSIT',
      'MOBILE',
      'WALLET',
    );
  }

  async momo_deposit(dto: CreateCreditTransactionSavingsAccountDto, type_code : string | null = null) {
    return await this.perform_transaction(
      dto,
       type_code ?? 'MOMO_DEPOSIT',
      'MOBILE',
      TransactionProvider.MOMO,
    );
  }

  async om_withdraw(dto: CreateDebitTransactionSavingsAccountDto, type_code : string | null = null) {
    dto.status = PaymentStatus.SUCCESSFULL;
    return await this.perform_transaction(
      dto,
       type_code ?? 'OM_WITHDRAW',
      'MOBILE',
      TransactionProvider.OM,
    );
  }

  async momo_withdraw(dto: CreateDebitTransactionSavingsAccountDto, type_code : string | null = null) {
    dto.status = PaymentStatus.SUCCESSFULL;
    return await this.perform_transaction(
      dto,
       type_code ?? 'MOMO_WITHDRAW',
      'MOBILE',
      TransactionProvider.MOMO,
    );
  }

  async om_deposit(dto: CreateCreditTransactionSavingsAccountDto, type_code : string | null = null) {
    return await this.perform_transaction(dto, type_code ?? TransactionCode.OM_DEPOSIT, 'MOBILE', TransactionProvider.OM);
  }

  async buy_tontine(dto: CreateTransactionSavingsAccountDto) {
    let saAdmin : SavingsAccount | null = null
    let branch_id : number | null = null

    if(dto.origin_savings_account_code)
    {
      const originSa = await this.savingsAccountService.findOneByCodeV1(dto.origin_savings_account_code)
      if(originSa)
        branch_id = originSa.branch.id
    }
      saAdmin = await this.savingsAccountService.findOneAdminTontine(branch_id)
      dto.target_savings_account_code = saAdmin.number_savings_account
    
    console.log(dto)
    if(!dto.origin_savings_account_code)
      return dto.provider == TransactionProvider.OM ? await this.om_deposit(dto, TransactionCode.BUY_TONTINE) :  await this.momo_deposit(dto, TransactionCode.BUY_TONTINE) ;
    return await this.perform_transaction(dto, TransactionCode.BUY_TONTINE, 'MOBILE', TransactionProvider.HYBRID_SAVING);
  }  
  
  async receive_tontine(dto: CreateTransactionSavingsAccountDto) {
    let saAdmin : SavingsAccount | null = null

    let branch_id : number | null = null

    if(dto.target_savings_account_code)
    {
      const targetSa = await this.savingsAccountService.findOneByCodeV1(dto.target_savings_account_code)
      if(targetSa)
        branch_id = targetSa.branch.id
    }
    saAdmin = await this.savingsAccountService.findOneAdminTontine(branch_id)
    dto.origin_savings_account_code = saAdmin.number_savings_account
    
    console.log(dto)
    if(!dto.target_savings_account_code)
      return dto.provider == TransactionProvider.OM ? await this.om_withdraw(dto, TransactionCode.BUY_TONTINE) :  await this.momo_withdraw(dto, TransactionCode.BUY_TONTINE) ;
    return await this.perform_transaction(dto, TransactionCode.RECEIVE_TONTINE, 'MOBILE', TransactionProvider.HYBRID_SAVING);

    /*if(dto.target_savings_account_code )
    {
      const originSa = await this.savingsAccountService.findOneByCodeV1(dto.target_savings_account_code)
      saAdmin = await this.savingsAccountService.findOneAdminTontine(originSa.branch.id)
      dto.origin_savings_account_code = saAdmin.number_savings_account
    }
    console.log(dto)
    return await this.perform_transaction(dto, TransactionCode.RECEIVE_TONTINE, 'MOBILE', TransactionProvider.HYBRID_SAVING);*/
  }

  async transaction_project(dto: CreateTransactionSavingsAccountDto) {
    console.log(dto)
    return await this.perform_transaction(dto, TransactionCode[dto.tx_type ?? TransactionCode.INTERNAL_TRANSFER], 'MOBILE', TransactionProvider.HYBRID_SAVING);
  }


  async e_wallet_withdrawal(dto: CreateDebitTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'E_WALLET_WITHDRAWAL',
      'MOBILE',
      'WALLET',
    );
  }

  async fee_maintenance(dto: CreateDebitTransactionSavingsAccountDto) {
    const saAdmin = await this.savingsAccountService.findOneAdmin(
      dto.branch_id,
    );
    dto.target_savings_account_code = saAdmin.number_savings_account;
    return await this.perform_transaction(
      dto,
      'ACCOUNT_MAINTENANCE_FEE',
      'API',
      'SYSTEM',
      true,
    );
  }

  async internal_transfer(
    dto: CreateTransactionSavingsAccountDto,
  ): Promise<ResponseTransactionSavingsAccountDto> {
    // maniere speciale pour virement interne
    const channel_code = dto.branch_id ? 'BRANCH' : 'MOBILE'
    /*let saAdmin : SavingsAccount | null = null
    if(!dto.target_savings_account_code && dto.origin_savings_account_code)
    {
      const originSa = await this.savingsAccountService.findOneByCodeV1(dto.origin_savings_account_code)
      saAdmin = await this.savingsAccountService.findOneAdmin(originSa.branch.id)
      dto.target_savings_account_code = saAdmin.number_savings_account
    }*/
    return  await this.perform_transaction(dto, 'INTERNAL_TRANSFER', channel_code, 'SYSTEM');
  }


  async checkStatusPayment(
    reference: string,
  ): Promise<any> {
    const tx  = await this.repo.findOne({
      where: { reference },
      relations: [
        'channelTransaction',
        'provider',
        'transactionType',
        'originSavingsAccount',
        'originSavingsAccount.originSavingsAccountTx',
        'originSavingsAccount.targetSavingsAccountTx',
        'targetSavingsAccount',
        'targetSavingsAccount.originSavingsAccountTx',
        'targetSavingsAccount.targetSavingsAccountTx',
      ],
    });
    const sa = await this.savingsAccountService.findOneByCodeV1(
      tx?.targetSavingsAccount?.number_savings_account ?? '',
    );

    console.log(reference);
    if (!tx) throw new NotFoundException(`Transaction ${reference} non trouvé`);
    if (tx.status === 1) return tx;

    const payment = await this.mcotiService.checkStatusPaymentDeposit(
      tx.token,
      tx.provider.code,
    );
    if (
      payment.paymentStatus != PaymentStatusProvider.PENDING &&
      payment.data &&
      tx.channelTransaction.code === TransactionChannel.MOBILE
    ) {
      const isFirstTx = await this.isFirstTransaction(
        plainToInstance(SavingsAccount, sa),
      );
      tx.status_provider = payment.paymentStatus;
      tx.status = PaymentStatus.PENDING;
      const dataPayment: Payment = payment.data;
      console.log('payment ' , tx.id , ' ', PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]] , ' ', payment);
      tx.payment_code = dataPayment.id;
      tx.payment_token_provider = dataPayment.payToken;
      tx.status_provider = dataPayment.paymentStatus;
      tx.status =
        PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
      if (tx.transactionType.is_credit) {
        tx.origin = dataPayment.ref;
      } else {
        tx.target = dataPayment.ref;
      }
      this.repo.save(tx);
      if (tx.status === PaymentStatus.SUCCESSFULL) {
        return await this.validate(tx.id, isFirstTx);
      }
    }
    return tx; // ignore si inactif
  }

  // Liste toutes les transactions épargne
  findAll(
    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,
    data: any = {},
  ): Promise<PaginatedResult<TransactionSavingsAccount>> {
    const qb = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.channelTransaction', 'channelTransaction')
      .leftJoinAndSelect('tx.provider', 'provider')
      .leftJoinAndSelect('tx.personnel', 'personnel')
      .leftJoinAndSelect('personnel.type_personnel', 'type_personnel')
      .leftJoinAndSelect('tx.transactionType', 'transactionType')
      .leftJoinAndSelect('tx.originSavingsAccount', 'originSavingsAccount')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'targetSavingsAccount');

    if (data.promo_code) {
      qb.andWhere('tx.promo_code = :promo_code', {
        promo_code: data.promo_code,
      });
    }
    if (data.commercial_code) {
      qb.andWhere('tx.commercial_code = :commercial_code', {
        commercial_code: data.commercial_code,
      });
    }
    if (data.personnel_id) {
      qb.andWhere('tx.personnel_id = :personnel_id', {
        personnel_id: data.personnel_id,
      });
    }

    qb.orderBy('tx.created_at', 'DESC');
    const options: PaginationOptions & {
      search?: SearchOptions;
      dateRange?: DateRange;
    } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to)
      options.dateRange = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
    console.log('------options---- ', options);
    return this.paginationService.paginate(qb, options);
  }

  async findAllTrans(
    branch_id: number | null,
  ): Promise<TransactionSavingsAccount[]> {
    const qb = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.channelTransaction', 'channelTransaction')
      .leftJoinAndSelect('tx.provider', 'provider')
      .leftJoinAndSelect('tx.personnel', 'personnel')
      .leftJoinAndSelect('personnel.type_personnel', 'type_personnel')
      .leftJoinAndSelect('tx.originSavingsAccount', 'originSa')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'targetSa')
      .leftJoin('originSa.branch', 'originBranch')
      .leftJoin('targetSa.branch', 'targetBranch');

    if (branch_id != null) {
      qb.andWhere(
        '(originBranch.id = :branch_id OR targetBranch.id = :branch_id)',
        { branch_id },
      );
    }

    return qb.getMany();
  }

  findAllByType(
    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,
    txTypeCode?: string,
    type?: string,
    id?: number,
    promo_code?: string,
    commercial_code?: number,
  ): Promise<PaginatedResult<TransactionSavingsAccount>> {
    const qb = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.channelTransaction', 'channelTransaction')
      .leftJoinAndSelect('tx.provider', 'provider')
      .leftJoinAndSelect('tx.transactionType', 'transactionType')
      .leftJoinAndSelect('tx.originSavingsAccount', 'originSavingsAccount')
      .leftJoinAndSelect('originSavingsAccount.customer', 'originCustomer')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'targetSavingsAccount')
      .leftJoinAndSelect('targetSavingsAccount.customer', 'targetCustomer');
    if (id !== undefined) {
      // Ou une autre condition selon votre DTO
      if (type !== undefined) {
        type === '1'
          ? qb.andWhere('targetSavingsAccount.id = :id', { id })
          : qb.andWhere('originSavingsAccount.id = :id', { id });
      } else
        qb.andWhere(
          'originSavingsAccount.id = :id OR targetSavingsAccount.id = :id',
          { id },
        );
    }

    qb.orderBy('tx.created_at', 'DESC');

    if (txTypeCode !== undefined) {
      qb.andWhere('transactionType.code LIKE :txTypeCode', {
        txTypeCode: `${txTypeCode}%`,
      });
    }
    // Filtre conditionnel pour IS_CREDIT (seulement si isCredit est fourni)
    console.log(type);
    if (type !== undefined) {
      // Ou une autre condition selon votre DTO
      qb.andWhere('transactionType.is_credit = :isCredit', {
        isCredit: type === '1' ? 1 : 0, // Adaptez selon le type en base (boolean/entier)
      });
    }
    if (type !== undefined) {
      // Ou une autre condition selon votre DTO
      qb.andWhere('transactionType.is_credit = :isCredit', {
        isCredit: type === '1' ? 1 : 0, // Adaptez selon le type en base (boolean/entier)
      });
    }
    if (type !== undefined) {
      // Ou une autre condition selon votre DTO
      qb.andWhere('transactionType.is_credit = :isCredit', {
        isCredit: type === '1' ? 1 : 0, // Adaptez selon le type en base (boolean/entier)
      });
    }
    qb.andWhere('transactionType.id IS NOT NULL');

    const options: PaginationOptions & {
      search?: SearchOptions;
      dateRange?: DateRange;
    } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to)
      options.dateRange = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
    console.log('------options---- ', options);
    return this.paginationService.paginate(qb, options);
  }

  async findAllByTypeSimple(
    type?: string,
    txTypeCode?: string,
    target?: string,
  ): Promise<TransactionSavingsAccount[]> {
    const qb = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.channelTransaction', 'channelTransaction')
      .leftJoinAndSelect('tx.provider', 'provider')
      .leftJoinAndSelect('tx.transactionType', 'transactionType')
      .leftJoinAndSelect('tx.originSavingsAccount', 'originSavingsAccount')
      .leftJoinAndSelect('originSavingsAccount.customer', 'originCustomer')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'targetSavingsAccount')
      .leftJoinAndSelect('targetSavingsAccount.customer', 'targetCustomer')
      .where('transactionType.id IS NOT NULL')
      .orderBy('tx.created_at', 'DESC');

    if (type !== undefined) {
      qb.andWhere('transactionType.is_credit = :isCredit', {
        isCredit: type === '1' ? 1 : 0,
      });
    }

    if (target !== undefined) {
      qb.andWhere('tx.target = :target', { target });
    }
    if (txTypeCode !== undefined) {
      qb.andWhere('transactionType.code LIKE :txTypeCode', {
        txTypeCode: `${txTypeCode}%`,
      });
    }

    return qb.getMany();
  }

  // Récupère une transaction par son ID
  async findOne(id: number | string): Promise<TransactionSavingsAccount> {
    const entity = await this.repo.findOne({
      where: [{ id: id as number }, { reference: id as string }],
      relations: [
        'channelTransaction',
        'provider',
        'transactionType',
        'originSavingsAccount',
        'targetSavingsAccount',
        'targetSavingsAccount.targetSavingsAccountTx',
        'targetSavingsAccount.customer',
      ],
    });
    if (!entity) throw new NotFoundException(`Transaction ${id} non trouvé`);
    return entity;
  }

  async validateTransaction(
    account: SavingsAccount | null,
    target: SavingsAccount | null,
    amount: number,
    is_credit: boolean,
    txTypeCode?: string,
  ) {
    // si le compte cible est desactivé et qu'il veut crédité on refuse
    if (
      target &&
      target.status === SavingsAccountStatus.DEACTIVATE &&
      is_credit
    ) {
      throw new BadRequestException('Compte cible Désactivé');
    }

    if (!account) return true;

    if (
      account &&
      (account.status === SavingsAccountStatus.DEACTIVATE ||
        account.status === SavingsAccountStatus.BLOCKED)
    ) {
      throw new BadRequestException("Compte d'origine désactive");
    }

    const avalaible_balance = account
      ? await this.savingsAccountService.avalaibleBalance(account.id)
      : 0;

    if (
      (account != null &&
      avalaible_balance < amount &&
      this.can_refuse_transaction_type_for_debit(txTypeCode , account.is_admin)) || amount < 0
    ) {
      throw new BadRequestException(
        `Solde insuffisant vous avez uniquement ${avalaible_balance}. Minimum Balance: ${account?.type_savings_account.minimum_balance}`,
      );
    }

    // On suppose que `account.activeInterest` a déjà été calculé via @AfterLoad()
    const active = account?.activeInterest;

    // 1. Si aucune relation d’intérêt active n’est trouvée, on rejette
    if (active) {
      throw new BadRequestException(
        'Durée de blocage non atteinte vous ne pouvez rien retiré',
      );
    }

    // 1. Vérifier si le compte est actif
    if (
      account?.status === SavingsAccountStatus.DEACTIVATE ||
      (account?.status === SavingsAccountStatus.BLOCKED && account != null)
    ) {
      throw new BadRequestException('Ce compte est inactif ou bloqué.');
    }

      

    // 4. Calculer les frais (ex: commission_per_product devenu account_opening_fee)
    const totalFees = account.type_savings_account.account_opening_fee; // + autres frais si besoin
    return { isValid: true, fees: totalFees };
  }

  private getAccountAgeMonths(createdAt: Date): number {
    const today = new Date();
    const months = (today.getFullYear() - createdAt.getFullYear()) * 12;
    return months + today.getMonth() - createdAt.getMonth();
  }
  async isFirstTransaction(target?:SavingsAccount | null){

    if(target?.is_admin || !target ){
      return false
    }
    const targetSavingsAccountTx = await this.savingsAccountService.getTransactions(target.id);
    // console.log('iiiiiiiiiiii ', !targetSavingsAccountTx , ' ',target?.is_admin)
    if(target && (!targetSavingsAccountTx  || target?.is_admin))
      return true

    let hasFirstDeposit = true
    if(target){
        for (const tx of targetSavingsAccountTx || []) {
            if (tx.status === PaymentStatus.SUCCESSFULL) {
                hasFirstDeposit = false;
                break; // Sortie immédiate de la boucle 
            }
        }
    }
    return hasFirstDeposit;
    // return target && target.status === SavingsAccountStatus.PENDING && !!tx.transactionType.is_credit && hasFirstDeposit
  }

  async validate_v0(
    id: number,
    isFirstTx = false,
    force = false,
  ): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    if (entity.status == 0) {
      entity.status = 1;
      entity.status_provider = 'SUCCESSFULL';

      // mettre a jour les solde coté coti
      if (
        entity.provider_code == TransactionProvider.OM ||
        entity.provider_code == TransactionProvider.MOMO
      ) {
        const updated_sold = await this.mcotiService.callMcotiEndpoint(
          'POST',
          `epargne/bank/operator/update-sold`,
          {
            provider: entity.provider_code,
            isCredit: entity.origin ? 0 : 1,
            amount: entity.origin ? entity.amount  : entity.amount + (entity.commission ?? 0) ,
          },
        );
        console.log('sold provider updated', updated_sold);
      }
    }
    let target: SavingsAccount | null = null; // Initialisation explicite à null
    const tx = await this.repo.save(entity);

    console.log('payment suscessful----- ', isFirstTx, '-----', tx.id , ' ', tx.status_provider)
    if(tx.targetSavingsAccount)
      target  = plainToInstance(SavingsAccount, await this.savingsAccountService.findOneByCodeV1(
        tx.targetSavingsAccount.number_savings_account,
    ));
    let comercial : Personnel| null = new Personnel();
    let partner : Personnel| null = new Personnel()
    let adminSa : SavingsAccount| null = new SavingsAccount()
    adminSa = await this.savingsAccountService.findOneAdmin(tx.targetSavingsAccount? target?.branch_id : tx.originSavingsAccount?.branch_id);
    if(target){
    }

    let mendoCoSa: SavingsAccount | null = null;
    if (process.env.MENDO_CO_CODE_SAVINGS_ACCOUNT) {
      mendoCoSa = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCodeV1(
          process.env.MENDO_CO_CODE_SAVINGS_ACCOUNT,
        ),
      );
    }
    let personnels: Personnel[] = [];
    // const isFirstTx = this.isFirstTransaction(target)// target && target.status === SavingsAccountStatus.PENDING && !!tx.transactionType.is_credit && (!target.targetSavingsAccountTx || target && target.targetSavingsAccountTx.length === 1)
    await this.repo.manager.transaction(async (entityManager) => {
      const { id, commission, ...txData } = tx;
      const chanelOpenProduct = await this.channelRepo.findOne({
        where: { code: 'API' },
      });

      if (target && (isFirstTx || force)) {
        tx.status = 1;
        console.log('isFirstTx------ ', isFirstTx, ' ', tx.status);
        // Transaction pour le minimum de balance
        const txRepo = entityManager.getRepository(TransactionSavingsAccount);
        const saRepo = entityManager.getRepository(SavingsAccount);
        txData.origin = txData.target;
        txData.originSavingsAccount = txData.targetSavingsAccount;
        const txTypeMinBalance = await this.transactionTypeService.findOneByCode('MIN_BALANCE');
        const providerMinBalance = await this.providerService.findOne('SYSTEM');
        txData.target = adminSa?.number_savings_account;
        txData.targetSavingsAccount = adminSa;
    




        const secondTx = new TransactionSavingsAccount();
        Object.assign(secondTx, txData);
        secondTx.amount = target.type_savings_account.minimum_balance;
        secondTx.transactionType = txTypeMinBalance;
        secondTx.provider = providerMinBalance;
        secondTx.is_locked = false;
        secondTx.status = TransactionSavingsAccountStatus.VALIDATE;
        secondTx.status_provider = 'SUCCESSFULL';
        if (chanelOpenProduct !== null) {
          secondTx.channelTransaction = chanelOpenProduct;
        }

        await entityManager.save(secondTx)
        // console.log('sauvegarde de la transaction de la balance minimun ',await entityManager.save(secondTx))   

        // Transaction pour le minimum de frais de creation de compte
        const txTypeOpenProduct =
          await this.transactionTypeService.findOneByCode('OPENING_FEE');
        const providerOpenProduct =
          await this.providerService.findOne('SYSTEM');
        const thirdTx = new TransactionSavingsAccount();
        Object.assign(thirdTx, txData);
        thirdTx.amount = target.type_savings_account.account_opening_fee;
        thirdTx.transactionType = txTypeOpenProduct;
        thirdTx.provider = providerOpenProduct;
        thirdTx.is_locked = false;
        thirdTx.status = TransactionSavingsAccountStatus.VALIDATE;
        thirdTx.status_provider = 'SUCCESSFULL';
        if (chanelOpenProduct !== null) {
          thirdTx.channelTransaction = chanelOpenProduct;
        }
        await entityManager.save(thirdTx);
        console.log(
          "sauvegarde de la transaction de frais d'ouverture de compte ",
          target.commercial_code,
        );

        txData.originSavingsAccount = adminSa;
        txData.origin = target.number_savings_account;

        if (target.commercial_code) {
          comercial = await this.personnelService.findOneByCode(
            target.commercial_code,
          );
          const unicity = await this.checkUniquenessPairs({
            commercial_code: comercial?.code,
            origin: tx.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
          });
          if (
            comercial &&
            comercial.savings_account &&
            !unicity.commercialConflict
          ) {
            // Transaction pour le le partenaire
            if (
              (comercial.is_intern &&
                (
                  await this.savingsAccountService.accountCreatedByCommercial(
                    comercial.code,
                  )
                ).length > 10) ||
              !comercial.is_intern
            ) {
              console.log(
                'rrrrCom ',
                (
                  await this.savingsAccountService.accountCreatedByCommercial(
                    comercial.code,
                  )
                ).length > 10,
              );
              const txTypePartner =
                await this.transactionTypeService.findOneByCode(
                  TransactionCode.COMMERCIAL_COMMISSION,
                );
              const providerOpenProduct =
                await this.providerService.findOne('SYSTEM');
              const commercial = await this.personnelService.findOneByCode(
                target.commercial_code,
                false,
              );
              const fifthTx = new TransactionSavingsAccount();
              Object.assign(fifthTx, txData);
              fifthTx.amount = Math.floor(
                (target.type_savings_account.minimum_balance *
                  target.type_savings_account.commission_per_product) /
                  100,
              );
              console.log('fifthTx.amount) ', fifthTx.amount);

              fifthTx.transactionType = txTypePartner;
              fifthTx.provider = providerOpenProduct;
              fifthTx.targetSavingsAccount = comercial?.savings_account;
              fifthTx.target =
                comercial?.savings_account.number_savings_account;
              fifthTx.originSavingsAccount = adminSa;
              fifthTx.origin =
                tx.targetSavingsAccount?.number_savings_account ?? 'SYSTEM';
              fifthTx.commercial_code = target.commercial_code;
              fifthTx.payment_code = await this.generateUniquePaymentCode();
              fifthTx.payment_token_provider =
                await this.generateUniquePaymentTokenProvider();
              fifthTx.reference = await this.formatTransactionReference(
                fifthTx.transactionType,
                providerOpenProduct.code,
              );
              fifthTx.is_locked = true;
              fifthTx.personnel = comercial;
              fifthTx.status = TransactionSavingsAccountStatus.VALIDATE;
              fifthTx.status = TransactionSavingsAccountStatus.VALIDATE;
              fifthTx.status_provider = PaymentStatusProvider.SUCCESSFULL;
              if (chanelOpenProduct !== null) {
                fifthTx.channelTransaction = chanelOpenProduct;
              }
              const r = await entityManager.save(fifthTx);
            }
            // this.savingsAccountService.updateBalance(comercial.saving_account.id)
          }
        }

        if (target.promo_code) {
          partner = await this.personnelService.findOneByCode(
            target.promo_code,
            false,
          );
          const unicity = await this.checkUniquenessPairs({
            promo_code: partner?.code,
            origin: tx.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
          });
          if (partner && partner.savings_account && !unicity.promoConflict) {
            // Transaction pour le le partenaire
            const txTypePartner =
              await this.transactionTypeService.findOneByCode(
                TransactionCode.PARTNER_COMMISSION,
              );
            const providerOpenProduct =
              await this.providerService.findOne('SYSTEM');
            const fourthTx = new TransactionSavingsAccount();
            Object.assign(fourthTx, txData);
            fourthTx.amount = Math.ceil(
              (target.type_savings_account.minimum_balance *
                target.type_savings_account.promo_code_fee) /
                100,
            );
            fourthTx.transactionType = txTypePartner;
            fourthTx.provider = providerOpenProduct;
            fourthTx.targetSavingsAccount = partner?.savings_account;
            fourthTx.target = partner?.savings_account.number_savings_account;
            fourthTx.originSavingsAccount = adminSa;
            fourthTx.origin =
              tx.targetSavingsAccount?.number_savings_account ?? 'SYSTEM';
            fourthTx.promo_code = target.promo_code;
            fourthTx.payment_code = await this.generateUniquePaymentCode();
            fourthTx.payment_token_provider =
              await this.generateUniquePaymentTokenProvider();
            fourthTx.reference = await this.formatTransactionReference(
              fourthTx.transactionType,
              providerOpenProduct.code,
            );
            fourthTx.status = TransactionSavingsAccountStatus.VALIDATE;
            fourthTx.personnel = partner;
            fourthTx.is_locked = true;
            fourthTx.status_provider = PaymentStatusProvider.SUCCESSFULL;
            if (chanelOpenProduct !== null) {
              fourthTx.channelTransaction = chanelOpenProduct;
            }
            const r = await entityManager.save(fourthTx);
            console.log('rrrr ', tx.commission);
            // this.savingsAccountService.updateBalance(partner.saving_account.id)
          }
        }

        // Transaction pour le personnel
        personnels =
          await this.personnelService.findAllExceptCommercialAndPartner();
        for (const personnel of personnels) {
          console.log('personnel', personnel.savings_account.id);
          //|| tx.transactionType.code === TransactionCode.INTERNAL_TRANSFER
          if (!personnel.savings_account || !target) continue;
          const txTypePartner = await this.transactionTypeService.findOneByCode(
            TransactionCode.COMMISSION_PERSONNEL,
          );
          const provider = await this.providerService.findOne('SYSTEM');
          const personnelTx = new TransactionSavingsAccount();
          Object.assign(personnelTx, txData);
          let amount = Math.round(
            (target.type_savings_account.minimum_balance *
              target.type_savings_account[
                `commission_${personnel.type_personnel.code.toLocaleLowerCase()}`
              ]) /
              100,
          );
          if (personnel.type_personnel.code === PersonnelTypeCode.MEMBRE)
            amount = Math.round(
              amount /
                (await this.personnelService.findAllMembersLength(personnels)),
            );
          // console.log('personnelTx.amount) ', personnelTx.amount)

          personnelTx.amount = amount;
          personnelTx.transactionType = txTypePartner;
          personnelTx.provider = provider;
          personnelTx.targetSavingsAccount = personnel?.savings_account;
          personnelTx.target =
            personnel?.savings_account.number_savings_account;
          personnelTx.originSavingsAccount = personnel.savings_account;
          personnelTx.origin = adminSa?.number_savings_account;
          personnelTx.commercial_code = null;
          personnelTx.payment_code = await this.generateUniquePaymentCode();
          personnelTx.payment_token_provider =
            await this.generateUniquePaymentTokenProvider();
          personnelTx.reference = await this.formatTransactionReference(
            personnelTx.transactionType,
            provider.code,
          );
          personnelTx.is_locked = true;
          personnelTx.tx_parent_id = tx.id;
          personnelTx.personnel = personnel;
          personnelTx.status = TransactionSavingsAccountStatus.VALIDATE;
          personnelTx.status_provider = PaymentStatusProvider.SUCCESSFULL;
          if (chanelOpenProduct !== null) {
            personnelTx.channelTransaction = chanelOpenProduct;
          }
          const r = await entityManager.save(personnelTx);
        }

        console.log('target.commercial_code) ', target.commercial_code);
        console.log('target.promo_code) ', target.promo_code);

        this.savingsAccountService.validateAccount(target.id);
      }

      // Transaction pour les commissions
      if (
        tx.commission &&
        tx.commission > 0 &&
        tx.channelTransaction.code == TransactionChannel.MOBILE &&
        tx.transactionType.code != TransactionCode.INTERNAL_TRANSFER
      ) {
        const commissionCash = await this.transactionTypeService.findOneByCode(
          tx.provider.code === TransactionProvider.MOMO
            ? TransactionCode.COMMISSION_CASH_MOMO
            : TransactionCode.COMMISSION_CASH_OM,
        );
        const providerOpenProduct =
          await this.providerService.findOne('SYSTEM');
        const commissionTx = new TransactionSavingsAccount();
        Object.assign(commissionTx, txData);
        commissionTx.amount = tx.commission;
        commissionTx.transactionType = commissionCash;
        commissionTx.provider = providerOpenProduct;
        commissionTx.targetSavingsAccount = adminSa;
        commissionTx.target = adminSa?.number_savings_account;
        commissionTx.originSavingsAccount = null;
        commissionTx.origin = 'SYSTEM';
        commissionTx.promo_code = null;
        commissionTx.payment_code = await this.generateUniquePaymentCode();
        commissionTx.payment_token_provider =
          await this.generateUniquePaymentTokenProvider();
        commissionTx.reference = await this.formatTransactionReference(
          commissionTx.transactionType,
          providerOpenProduct.code,
        );
        commissionTx.status = TransactionSavingsAccountStatus.VALIDATE;
        commissionTx.is_locked = false;
        commissionTx.tx_parent_id = tx.id;
        commissionTx.status_provider = PaymentStatusProvider.SUCCESSFULL;
        if (chanelOpenProduct !== null) {
          commissionTx.channelTransaction = chanelOpenProduct;
        }
        const r = await this.repo.save(commissionTx);

        const { id, ...commissionTxData } = r;
        const commissionCashFinance =
          await this.transactionTypeService.findOneByCode(
            tx.provider.code === TransactionProvider.OM
              ? TransactionCode.COMMISSION_CASH_OM_MFINANCE
              : TransactionCode.COMMISSION_CASH_MOMO_MFINANCE,
          );

        const commissionTxMC = new TransactionSavingsAccount(); // Create new instance
        Object.assign(commissionTxMC, commissionTxData);
        if (mendoCoSa) {
          commissionTxMC.targetSavingsAccount = mendoCoSa;
          commissionTxMC.target = mendoCoSa?.number_savings_account;
        }
        commissionTxMC.transactionType = commissionCashFinance;
        commissionTxMC.originSavingsAccount = adminSa;
        commissionTxMC.origin = adminSa?.number_savings_account;
        commissionTxMC.payment_code = await this.generateUniquePaymentCode();
        commissionTxMC.amount = 4;
        commissionTxMC.payment_token_provider =
          await this.generateUniquePaymentTokenProvider();
        commissionTxMC.reference = await this.formatTransactionReference(
          commissionTxMC.transactionType,
          providerOpenProduct.code,
        );
        const rs = await this.repo.save(commissionTxMC);
        console.log('rrrr ', r.id);
      }
    });

    console.log('entity.entity.provider_code', entity.channelTransaction.code);

    if (adminSa && adminSa.id) {
      this.savingsAccountService.updateBalance(adminSa.id);
    }
    if (comercial && comercial.savings_account) {
      console.log('update solde commercial');

      this.savingsAccountService.updateBalance(comercial.savings_account.id);
    }
    if (partner && partner.savings_account) {
      console.log('update solde partner');
      this.savingsAccountService.updateBalance(partner.savings_account.id);
    }
    if (entity.targetSavingsAccount) {
      console.log('update solde target');

      this.savingsAccountService.updateBalance(entity.targetSavingsAccount.id);
    }
    if (entity.originSavingsAccount) {
      console.log('update solde origin');

      this.savingsAccountService.updateBalance(entity.originSavingsAccount.id);
    }
    for (const personnel of personnels) {
      await this.savingsAccountService.updateBalance(
        personnel.savings_account.id,
      );
    }
    return tx;
  }
  async validate(
    id: number,
    isFirstTx = false,
    force = false,
  ): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);

    // 1) Marquer la tx principale "SUCCESSFULL" et MAJ opérateur si mobile
    if (entity.status == 0) {
      entity.status = 1;
      entity.status_provider = 'SUCCESSFULL';
      await this.update_bank_operator_sold_if_mobile(entity);
    }

    // 2) Sauvegarde de la tx principale
    let target: SavingsAccount | null = null;
    const tx = await this.repo.save(entity);

    // 3) Résolution du compte cible & compte admin
    if (tx.targetSavingsAccount) {
      target = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCodeV1(
          tx.targetSavingsAccount.number_savings_account,
        ),
      );
    }

    let comercial: Personnel | null = new Personnel();
    let partner: Personnel | null = new Personnel();
    const admin_sa = await this.get_admin_sa_for_tx(tx);

    // 4) Compte mendoCo (si défini)
    const mendo_co_sa = await this.get_mendo_co_sa_from_env();

    let personnels: Personnel[] = [];

    // 5) Exécuter toutes les sous-transactions dans une transaction DB
    await this.repo.manager.transaction(async (entity_manager) => {
      const { id, commission, ...tx_data } = tx;
      const chanel_open_product = await this.get_api_channel();

      // 5.1) Ouverture de compte : MIN_BALANCE + OPENING_FEE + commissions commerciales/partenaires + au personnel
      if (target && (isFirstTx || force)) {
        tx.status = 1;

        // a) Minimum de solde
        await this.create_tx_min_balance(
          entity_manager,
          tx_data,
          target,
          admin_sa,
          chanel_open_product,
        );

        // b) Frais d'ouverture
        await this.create_tx_opening_fee(
          entity_manager,
          tx_data,
          target,
          admin_sa,
          chanel_open_product,
        );

        // c) Commission commercial (si conditions)
        ({ comercial } = await this.maybe_create_tx_commercial_commission(
          entity_manager,
          tx_data,
          tx,
          target,
          admin_sa,
          chanel_open_product,
        ));

        // d) Commission partenaire (promo_code)
        ({ partner } = await this.maybe_create_tx_partner_commission(
          entity_manager,
          tx_data,
          tx,
          target,
          admin_sa,
          chanel_open_product,
        ));

        // e) Commissions du personnel (boucle interne)
        personnels = await this.create_tx_personnel_commissions(
          entity_manager,
          tx_data,
          tx,
          target,
          admin_sa,
          chanel_open_product,
        );

        // f) Validation du compte cible
        this.savingsAccountService.validateAccount(target.id);
      }

      // 5.2) Commission CASH (provider) + commission “MFINANCE”
      await this.maybe_create_tx_commission_cash_pair(
        entity_manager,
        tx,
        admin_sa,
        mendo_co_sa,
      );
    });

    // 6) Mise à jour des soldes des comptes impactés
    await this.update_balances_after_validate(tx, admin_sa, comercial, partner, personnels);

    return tx;
  }


  async unlockTransaction(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    entity.is_locked = false;
    return this.repo.save(entity);
  }

  async unlockTransactionByPartner(promo_code, idSa): Promise<any> {
    this.repo.update({ promo_code }, { is_locked: false });
    this.savingsAccountService.updateBalance(idSa);
    return true;
  }
  async unlockTransactionForPersonnel(
    personnel_id,
    idSa,
    minTxs,
  ): Promise<any> {
    const txs = await this.repo.findAndCount({
      where: { personnel_id },
    });
    console.log('personnel_id', txs[1]);
    console.log('idSa', idSa);
    if (txs[1] < minTxs) {
      throw new BadRequestException(
        `Vous devez avoir au moins ${minTxs} transactions pour etre payé`,
      );
    }
    this.repo.update({ personnel_id }, { is_locked: false });
    this.savingsAccountService.updateBalance(idSa);
    return true;
  }

  async unlockTransactionByCommercial(
    commercial_code,
    idSa: any = null,
  ): Promise<any> {
    this.repo.update({ commercial_code }, { is_locked: false });
    this.savingsAccountService.updateBalance(idSa);
    return true;
  }

  async update(
    tx: TransactionSavingsAccount,
  ): Promise<TransactionSavingsAccount> {
    return this.repo.save(tx);
  }

  // Supprime une transaction
  async remove(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }

  private getMonthsBetween(start: Date, end: Date): number {
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = start.getMonth();
    const endMonth = end.getMonth();

    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }

  // Méthode pour générer un payment_code unique
  private async generateUniquePaymentCode(): Promise<string> {
    let isUnique = false;
    let paymentCode: string;
    let attempts = 0;

    do {
      // Génère un UUID v4 (format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
      paymentCode = uuidv4();

      // Vérifie l'unicité dans la base de données
      const exists = await this.repo.findOne({
        where: { payment_code: paymentCode },
      });

      isUnique = !exists;
      attempts++;

      if (attempts > 15) {
        throw new BadRequestException(
          'Impossible de générer un paymentCode unique',
        );
      }
    } while (!isUnique);

    return paymentCode;
  }

  private async generateUniquePaymentTokenProvider(): Promise<string> {
    let isUnique = false;
    let paymentTokenProvider: string;
    let attempts = 0;

    do {
      // Génère un UUID v4 (format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
      paymentTokenProvider = uuidv4();

      // Vérifie l'unicité dans la base de données
      const exists = await this.repo.findOne({
        where: { payment_token_provider: paymentTokenProvider },
      });

      isUnique = !exists;
      attempts++;

      if (attempts > 15) {
        throw new BadRequestException(
          'Impossible de générer un paymentTokenProvider unique',
        );
      }
    } while (!isUnique);

    return paymentTokenProvider;
  }

  // Méthode pour formater la référence
  async formatTransactionReference(
    txType: TransactionType,
    provider = '',
  ): Promise<string> {
    const typeCode = txType.code;
    const now = new Date();
    provider = provider === 'MOMO' || provider === 'OM' ? provider : ''; // Limite à 3 caractères
    const prefix = txType.is_credit ? 'DEP' : 'RET'; //typeCode.substring(0, 2).toUpperCase();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).substring(2);

    // Génération du suffixe numérique unique
    const suffix = await this.generateDailySequence(); // Implémentez cette méthode

    return `${prefix}${provider}${day}${month}${year}${suffix}`;
  }

  async generateDailySequence(): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // On extrait la valeur de la transaction
    const sequenceValue = await this.repo.manager.transaction(
      async (transactionalEntityManager) => {
        const sequenceRepo = transactionalEntityManager.getRepository(Sequence);
        let sequence = await sequenceRepo.findOne({
          where: { date: today },
          lock: { mode: 'pessimistic_write' },
        });

        if (!sequence) {
          sequence = sequenceRepo.create({ date: today, value: 1 });
        } else {
          sequence.value += 1;
        }

        await sequenceRepo.save(sequence);
        return sequence.value; // Retourne le nombre directement
      },
    );

    return String(sequenceValue).padStart(5, '0'); // Formatage en dehors de la transaction
  }

  async updateProviderInfo(id: number, dto: UpdateProviderInfoDto) {
    console.log(dto);

    let tx = await this.findOne(id);
    if (!tx) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    // tx.status = PaymentStatus[dto.status_provider ?? PaymentStatusProvider.PENDING]
    tx.payment_token_provider = dto.payToken;
    const channel_code = tx.channelTransaction.code;
    const txType = tx.transactionType;
    if (tx.targetSavingsAccount) {
      tx.origin = dto.phoneNumber;
    } else {
      tx.target = dto.phoneNumber;
    }
    if (tx.originSavingsAccount)
      tx.status_provider = PaymentStatusProvider.SUCCESSFULL;
    tx.payment_token_provider = dto.payment_token_provider ?? this.generateUniquePaymentTokenProvider();
    tx.payment_code = dto.payment_code ?? this.generateUniquePaymentCode();
    this.repo.save(tx);
    // const isFirstTx = await  this.isFirstTransaction(tx.targetSavingsAccount)
    if (channel_code === 'MOBILE' && tx.targetSavingsAccount) {
      let isFirstTx = false;
      // if(tx.targetSavingsAccount){

      const sa = await this.savingsAccountService.findOneByCodeV1(
        tx.targetSavingsAccount?.number_savings_account ?? '',
      );
      isFirstTx = await this.isFirstTransaction(
        plainToInstance(SavingsAccount, sa),
      );
      // }
      console.log(tx.token, '  ', tx.provider.code);
      const paymentResult = await new Promise<
        ReturnType<typeof this.mcotiService.checkStatusPaymentDeposit>
      >((resolve, reject) => {
        setTimeout(() => {
          this.mcotiService
            .checkStatusPaymentDeposit(tx.token, tx.provider.code)
            .then(resolve)
            .catch(reject);
        }, 10000);
      });
      // const paymentResult = await this.mcotiService.checkStatusPaymentDeposit(tx.token, tx.provider.code)
      console.log('paymentResult', paymentResult);
      if (paymentResult && paymentResult.data) {
        const dataPayment: Payment = paymentResult.data;
        tx.payment_code = dataPayment.id;
        tx.payment_token_provider = dataPayment.payToken;
        tx.status_provider = dataPayment.paymentStatus;
        tx.commission = dataPayment.amountHT - tx.amount;
        tx.status = PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
        if (tx.targetSavingsAccount) {
          tx.origin = dataPayment.ref;
        } else {
          tx.target = dataPayment.ref;
        }
        if (tx.status === PaymentStatus.SUCCESSFULL) {
          tx = await this.validate(tx.id, isFirstTx);
        }
        console.log('is_credit ', dataPayment.ref);

        // this.repo.save(tx);
        console.log(dataPayment.paymentStatus, ' === ', PaymentStatusProvider.PENDING,);
        // Si le paiment est a pending e=on lance un job
        if (dataPayment.paymentStatus === PaymentStatusProvider.PENDING)
          await this.queueService.addTaskCheckPayment(tx.id);
      }
    }

    // Object.assign(tx, dto); // Mise à jour des champs fournis

    return this.repo.save(tx);
  }
  async checkWthDraw(t) {
    return await this.mcotiService.checkStatusPaymentWithDraw(t);
  }

  async checkUniquenessPairs(params: {
    origin: string;
    promo_code?: string | null;
    commercial_code?: string | null;
    excludeId?: number;
  }): Promise<{
    promoConflict: boolean;
    promoId: number | null;
    commercialConflict: boolean;
    txId: number | null;
  }> {
    const { origin } = params;
    const promo_code = params.promo_code?.trim() || null;
    const commercial_code = params.commercial_code?.trim() || null;
    const excludeId = params.excludeId;

    const wherePromo = promo_code
      ? { origin, promo_code, ...(excludeId ? { id: Not(excludeId) } : {}) }
      : null;

    const whereCommercial = commercial_code
      ? {
          origin,
          commercial_code,
          ...(excludeId ? { id: Not(excludeId) } : {}),
        }
      : null;

    // aucune paire fournie → pas de conflit
    if (!wherePromo && !whereCommercial) {
      return {
        promoConflict: false,
        promoId: null,
        commercialConflict: false,
        txId: null,
      };
    }

    const [promoHit, commercialHit] = await Promise.all([
      wherePromo
        ? this.repo.findOne({ where: wherePromo, select: ['id'] })
        : null,
      whereCommercial
        ? this.repo.findOne({ where: whereCommercial, select: ['id'] })
        : null,
    ]);

    return {
      promoConflict: !!promoHit,
      promoId: promoHit?.id ?? null,
      commercialConflict: !!commercialHit,
      txId: commercialHit?.id ?? null,
    };
  }



    /**
  * Met à jour le sold côté COTI pour les providers mobiles.
  */
  private async update_bank_operator_sold_if_mobile(entity: TransactionSavingsAccount): Promise<void> {
    if (
      entity.provider_code == TransactionProvider.OM ||
      entity.provider_code == TransactionProvider.MOMO
    ) {
      console.log(        {
          provider: entity.provider_code, 
          isCredit: entity.originSavingsAccount ? 0 : 1,
          amount: entity.origin ? Number(entity.amount)  : Math.trunc(Number(entity.amount) + Number(entity.commission ?? 0)) ,
        })
      const updated_sold = await this.mcotiService.callMcotiEndpoint(
        'POST',
        `epargne/bank/operator/update-sold`,
        {
          provider: entity.provider_code, 
          isCredit: entity.originSavingsAccount ? 0 : 1,
          amount: entity.origin ? Number(entity.amount)  : Math.trunc(Number(entity.amount) + Number(entity.commission ?? 0)) ,
        },
      );
      // console.log('sold provider updated', entity.amount + (entity.commission ?? 0));
    }
  }

  /**
  * Retourne le SavingsAccount admin (branche du target si présent sinon de l’origin).
  */
  private async get_admin_sa_for_tx(
    tx: TransactionSavingsAccount
  ): Promise<SavingsAccount | null> {

    console.log(tx.id , ' ',tx.originSavingsAccount?.branch_id , ' ',tx.targetSavingsAccount?.branch_id)
    return this.savingsAccountService.findOneAdmin(
      tx.targetSavingsAccount ? tx.targetSavingsAccount?.branch_id : tx.originSavingsAccount?.branch_id,
    );
  }

  /**
  * Retourne le compte MendoCo depuis la variable d’environnement si disponible.
  */
  private async get_mendo_co_sa_from_env(): Promise<SavingsAccount | null> {
    if (!process.env.MENDO_CO_CODE_SAVINGS_ACCOUNT) return null;
    return plainToInstance(
      SavingsAccount,
      await this.savingsAccountService.findOneByCodeV1(process.env.MENDO_CO_CODE_SAVINGS_ACCOUNT),
    );
  }

  /**
  * Récupère le channel 'API' (si existe).
  */
  private async get_api_channel() {
    return this.channelRepo.findOne({ where: { code: 'API' } });
  }

  /**
  * Crée la transaction de solde minimum (MIN_BALANCE) vers le compte admin.
  */
  private async create_tx_min_balance(
    entity_manager,
    tx_data: TransactionSavingsAccount | any,
    target: SavingsAccount,
    admin_sa: SavingsAccount | null,
    chanel_open_product: any,
  ): Promise<TransactionSavingsAccount> {
    const tx_repo = entity_manager.getRepository(TransactionSavingsAccount);

    // on prélève depuis le compte cible vers admin
    const tx_type_min_balance = await this.transactionTypeService.findOneByCode('MIN_BALANCE');
    const provider_min_balance = await this.providerService.findOne('SYSTEM');

    const tx_min = new TransactionSavingsAccount();
    Object.assign(tx_min, {
      ...tx_data,
      origin: tx_data.target,
      originSavingsAccount: tx_data.targetSavingsAccount,
      target: admin_sa?.number_savings_account,
      targetSavingsAccount: admin_sa,
      amount: target.type_savings_account.minimum_balance,
      transactionType: tx_type_min_balance,
      provider: provider_min_balance,
      is_locked: false,
      status: TransactionSavingsAccountStatus.VALIDATE,
      status_provider: 'SUCCESSFULL',
    });

    if (chanel_open_product) tx_min.channelTransaction = chanel_open_product;

    return tx_repo.save(tx_min);
  }

  /**
  * Crée la transaction de frais d’ouverture (OPENING_FEE) vers le compte admin.
  */
  private async create_tx_opening_fee(
    entity_manager,
    tx_data: TransactionSavingsAccount | any,
    target: SavingsAccount,
    admin_sa: SavingsAccount | null,
    chanel_open_product: any,
  ): Promise<TransactionSavingsAccount> {
    const tx_repo = entity_manager.getRepository(TransactionSavingsAccount);

    const tx_type_open_product = await this.transactionTypeService.findOneByCode('OPENING_FEE');
    const provider_open_product = await this.providerService.findOne('SYSTEM');

    const tx_fee = new TransactionSavingsAccount();
    Object.assign(tx_fee, {
      ...tx_data,
      origin: tx_data.target,
      originSavingsAccount: tx_data.targetSavingsAccount,
      target: admin_sa?.number_savings_account,
      targetSavingsAccount: admin_sa,
      amount: target.type_savings_account.account_opening_fee,
      transactionType: tx_type_open_product,
      provider: provider_open_product,
      is_locked: false,
      status: TransactionSavingsAccountStatus.VALIDATE,
      status_provider: 'SUCCESSFULL',
    });

    if (chanel_open_product) tx_fee.channelTransaction = chanel_open_product;

    return tx_repo.save(tx_fee);
  }

  /**
  * Crée la commission commerciale si éligible.
  * Retourne { comercial } pour conserver ta variable.
  */
  private async maybe_create_tx_commercial_commission(
    entity_manager,
    tx_data: TransactionSavingsAccount | any,
    tx_parent: TransactionSavingsAccount, 
    target: SavingsAccount,
    admin_sa: SavingsAccount | null,
    chanel_open_product: any,
  ): Promise<{ comercial: Personnel | null }> {
    let comercial: Personnel | null = null;
    // console.log('eligible ', target.commercial_code)

    if (!target.commercial_code) return { comercial };

    comercial = await this.personnelService.findOneByCode(target.commercial_code);
    const unicity = await this.checkUniquenessPairs({
      commercial_code: comercial?.code,
      origin: tx_parent.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
    });

    const nb_created = comercial
      ? (await this.savingsAccountService.accountCreatedByCommercial(comercial.code)).length
      : 0;

    const eligible =
      comercial &&
      comercial.savings_account &&
      !unicity.commercialConflict &&
      ((comercial.is_intern && nb_created > 10) || !comercial.is_intern);

    if (!eligible) return { comercial };

    const tx_type_partner = await this.transactionTypeService.findOneByCode(
      TransactionCode.COMMERCIAL_COMMISSION,
    );
    const provider_open_product = await this.providerService.findOne('SYSTEM');

    const fifth_tx = new TransactionSavingsAccount();
    Object.assign(fifth_tx, {
      ...tx_data,
      amount: Math.floor(
        (target.type_savings_account.minimum_balance *
          target.type_savings_account.commission_per_product) / 100,
      ),
      transactionType: tx_type_partner,
      provider: provider_open_product,
      targetSavingsAccount: comercial?.savings_account,
      target: comercial?.savings_account.number_savings_account,
      originSavingsAccount: admin_sa,
      origin: tx_parent.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
      commercial_code: target.commercial_code,
      payment_code: await this.generateUniquePaymentCode(),
      payment_token_provider: await this.generateUniquePaymentTokenProvider(),
      reference: await this.formatTransactionReference(tx_type_partner, provider_open_product.code),
      is_locked: true,
      personnel: comercial,
      status: TransactionSavingsAccountStatus.VALIDATE,
      status_provider: PaymentStatusProvider.SUCCESSFULL,
    });

    if (chanel_open_product) fifth_tx.channelTransaction = chanel_open_product;

    await entity_manager.save(fifth_tx);
    return { comercial };
  }

  /**
  * Crée la commission partenaire (promo_code) si éligible.
  * Retourne { partner } pour conserver ta variable.
  */
  private async maybe_create_tx_partner_commission(
    entity_manager,
    tx_data: TransactionSavingsAccount | any,
    tx_parent: TransactionSavingsAccount,
    target: SavingsAccount,
    admin_sa: SavingsAccount | null,
    chanel_open_product: any,
  ): Promise<{ partner: Personnel | null }> {
    let partner: Personnel | null = null;

    if (!target.promo_code) return { partner };

    partner = await this.personnelService.findOneByCode(target.promo_code, false);
    const unicity = await this.checkUniquenessPairs({
      promo_code: partner?.code,
      origin: tx_parent.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
    });

    const eligible = partner && partner.savings_account && !unicity.promoConflict;
    if (!eligible) return { partner };

    const tx_type_partner = await this.transactionTypeService.findOneByCode(
      TransactionCode.PARTNER_COMMISSION,
    );
    const provider_open_product = await this.providerService.findOne('SYSTEM');

    const fourth_tx = new TransactionSavingsAccount();
    Object.assign(fourth_tx, {
      ...tx_data,
      amount: Math.ceil(
        (target.type_savings_account.minimum_balance * target.type_savings_account.promo_code_fee) /
          100,
      ),
      transactionType: tx_type_partner,
      provider: provider_open_product,
      targetSavingsAccount: partner?.savings_account,
      target: partner?.savings_account.number_savings_account,
      originSavingsAccount: admin_sa,
      origin: tx_parent.targetSavingsAccount?.number_savings_account ?? 'SYSTEM',
      promo_code: target.promo_code,
      payment_code: await this.generateUniquePaymentCode(),
      payment_token_provider: await this.generateUniquePaymentTokenProvider(),
      reference: await this.formatTransactionReference(tx_type_partner, provider_open_product.code),
      status: TransactionSavingsAccountStatus.VALIDATE,
      personnel: partner,
      is_locked: true,
      status_provider: PaymentStatusProvider.SUCCESSFULL,
    });

    if (chanel_open_product) fourth_tx.channelTransaction = chanel_open_product;

    await entity_manager.save(fourth_tx);
    return { partner };
  }

  /**
  * Crée les commissions pour le personnel (boucle).
  * Retourne la liste des personnels impactés (pour MAJ soldes).
  */
  private async create_tx_personnel_commissions(
    entity_manager,
    tx_data: TransactionSavingsAccount | any,
    tx_parent: TransactionSavingsAccount,
    target: SavingsAccount,
    admin_sa: SavingsAccount | null,
    chanel_open_product: any,
  ): Promise<Personnel[]> {
    const personnels = await this.personnelService.findAllExceptCommercialAndPartner();
    const tx_type_partner = await this.transactionTypeService.findOneByCode(
      TransactionCode.COMMISSION_PERSONNEL,
    );
    const provider = await this.providerService.findOne('SYSTEM');

    for (const personnel of personnels) {
      if (!personnel.savings_account || !target) continue;

      let amount = Math.round(
        (target.type_savings_account.minimum_balance *
          target.type_savings_account[
            `commission_${personnel.type_personnel.code.toLocaleLowerCase()}`
          ]) /
          100,
      );

      if (personnel.type_personnel.code === PersonnelTypeCode.MEMBRE) {
        amount = Math.round(amount / (await this.personnelService.findAllMembersLength(personnels)));
      }

      const personnel_tx = new TransactionSavingsAccount();
      Object.assign(personnel_tx, {
        ...tx_data,
        amount,
        transactionType: tx_type_partner,
        provider,
        targetSavingsAccount: personnel.savings_account,
        target: personnel.savings_account.number_savings_account,
        originSavingsAccount: admin_sa,
        origin: admin_sa?.number_savings_account,
        commercial_code: null,
        payment_code: await this.generateUniquePaymentCode(),
        payment_token_provider: await this.generateUniquePaymentTokenProvider(),
        reference: await this.formatTransactionReference(tx_type_partner, provider.code),
        is_locked: true,
        tx_parent_id: tx_parent.id,
        personnel,
        status: TransactionSavingsAccountStatus.VALIDATE,
        status_provider: PaymentStatusProvider.SUCCESSFULL,
      });

      if (chanel_open_product) personnel_tx.channelTransaction = chanel_open_product;

      await entity_manager.save(personnel_tx);
    }

    return personnels;
  }

  /**
  * Crée les deux transactions de commission CASH (provider + MFINANCE) si conditions remplies.
  */
  private async maybe_create_tx_commission_cash_pair(
    entity_manager,
    tx: TransactionSavingsAccount,
    admin_sa: SavingsAccount | null,
    mendo_co_sa: SavingsAccount | null,
  ): Promise<void> {
    if (
      !tx.commission ||
      tx.commission <= 0 ||
      tx.channelTransaction.code != TransactionChannel.MOBILE ||
      tx.transactionType.code == TransactionCode.INTERNAL_TRANSFER
    ) {
      return;
    }

    // 1) Commission cash (provider) vers admin
    const commission_cash = await this.transactionTypeService.findOneByCode(
      tx.provider.code === TransactionProvider.MOMO
        ? TransactionCode.COMMISSION_CASH_MOMO
        : TransactionCode.COMMISSION_CASH_OM,
    );
    const provider_system = await this.providerService.findOne('SYSTEM');

    const commission_tx = new TransactionSavingsAccount();
    Object.assign(commission_tx, {
      ...tx,
      id: undefined, // s'assure de créer une nouvelle entité
      amount: tx.commission,
      transactionType: commission_cash,
      provider: provider_system,
      targetSavingsAccount: admin_sa,
      target: admin_sa?.number_savings_account,
      // originSavingsAccount: null,
      commission : 0,
      // origin: 'SYSTEM',
      // promo_code: null,
      payment_code: await this.generateUniquePaymentCode(),
      payment_token_provider: await this.generateUniquePaymentTokenProvider(),
      reference: await this.formatTransactionReference(commission_cash, provider_system.code),
      status: TransactionSavingsAccountStatus.VALIDATE,
      is_locked: false,
      tx_parent_id: tx.id,
      status_provider: PaymentStatusProvider.SUCCESSFULL,
    });

    const r = await this.repo.save(commission_tx);

    // 2) Commission cash “finance” vers mendoCo (si défini)
    const commission_cash_finance = await this.transactionTypeService.findOneByCode(
      tx.provider.code === TransactionProvider.OM
        ? TransactionCode.COMMISSION_CASH_OM_MFINANCE
        : TransactionCode.COMMISSION_CASH_MOMO_MFINANCE,
    );

    const commission_tx_mc = new TransactionSavingsAccount();
    Object.assign(commission_tx_mc, {
      ...r,
      id: undefined,
      transactionType: commission_cash_finance,
      targetSavingsAccount: mendo_co_sa ?? null,
      target: mendo_co_sa?.number_savings_account ?? null,
      originSavingsAccount: admin_sa,
      origin: admin_sa?.number_savings_account,
      payment_code: await this.generateUniquePaymentCode(),
      amount: 4, // inchangé par rapport à ton code
      payment_token_provider: await this.generateUniquePaymentTokenProvider(),
      reference: await this.formatTransactionReference(commission_cash_finance, provider_system.code),
    });

    await this.repo.save(commission_tx_mc);
  }

  /**
  * Met à jour tous les soldes nécessaires à la fin du process.
  */
  private async update_balances_after_validate(
    tx: TransactionSavingsAccount,
    admin_sa: SavingsAccount | null,
    comercial: Personnel | null,
    partner: Personnel | null,
    personnels: Personnel[],
    mendo_co_sa?: SavingsAccount | null,
  ): Promise<void> {
    console.log('entity.entity.provider_code', tx.channelTransaction.code);

    if (admin_sa && admin_sa.id) {
      await this.savingsAccountService.updateBalance(admin_sa.id);
    }

    if (comercial && comercial.savings_account) {
      console.log('update solde commercial');
      await this.savingsAccountService.updateBalance(comercial.savings_account.id);
    }
    if (partner && partner.savings_account) {
      console.log('update solde partner');
      await this.savingsAccountService.updateBalance(partner.savings_account.id);
    }
    if (tx.targetSavingsAccount) {
      console.log('update solde target');
      await this.savingsAccountService.updateBalance(tx.targetSavingsAccount.id);
    }
    if (tx.originSavingsAccount) {
      console.log('update solde origin');
      await this.savingsAccountService.updateBalance(tx.originSavingsAccount.id);
    }
    for (const p of personnels) {
      await this.savingsAccountService.updateBalance(p.savings_account.id);
    }
    if (mendo_co_sa && mendo_co_sa.id) {
      await this.savingsAccountService.updateBalance(mendo_co_sa.id);
    }
  }



  /**
   * Récupère les retraits dont la commission n'a pas encore été matérialisée
   * par une sous-transaction de type '...COMMISSION_CASH...'.
   * - retrait => transaction_type.is_credit = 0
   * - commission prévue => transaction_type.fee_percentage > 0
   * - origin non null, target null
   * - pas de sous-tx (child) avec ttype.code LIKE '%COMMISSION_CASH%'
   */

  async find_withdrawals_without_commission(page?: number, limit?: number) {
    const take = limit && limit > 0 ? limit : 50;
    const skip = page && page > 0 ? (page - 1) * take : 0;

    const qb: SelectQueryBuilder<TransactionSavingsAccount> = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.transactionType', 'tt')
      .leftJoinAndSelect('tx.channelTransaction', 'ct')
      .leftJoinAndSelect('tx.originSavingsAccount', 'osa')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'tsa')

      // retrait
      // commission prévue sur la tx parente
      .andWhere('tx.commission > 0')
      // origin non null, target null
      .andWhere('tx.origin_savings_account_id IS NOT NULL')
      .andWhere('tx.target_savings_account_id IS NULL')
      // Aucune sous-transaction "commission cash"
      .andWhere(qb2 => {
        const sub = qb2.subQuery()
          .select('1')
          .from(TransactionSavingsAccount, 'txc')
          .leftJoinAndSelect('txc.transactionType', 'ttc')
          .where('txc.tx_parent_id = tx.id')
          .andWhere('ttc.code LIKE :commission_code')
          .getQuery();
        return `NOT EXISTS ${sub}`;
      }, { commission_code: '%COMMISSION_CASH%' })
      .orderBy('tx.created_at', 'DESC')
      .skip(skip)
      .take(take);

    const [rows, total] = await qb.getManyAndCount();
    return { total, page: page ?? 1, limit: take, data: rows };
  }   
  async validate_withdrawals_without_commission() {

    const qb: SelectQueryBuilder<TransactionSavingsAccount> = this.repo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.transactionType', 'tt')
      .leftJoinAndSelect('tx.channelTransaction', 'ct')
      .leftJoinAndSelect('tx.provider', 'p')
      .leftJoinAndSelect('tx.originSavingsAccount', 'osa')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'tsa')
      // retrait
      // commission prévue sur la tx parente
      .andWhere('tx.commission > 0')
      // origin non null, target null
      .andWhere('tx.origin_savings_account_id IS NOT NULL')
      .andWhere('tx.target_savings_account_id IS NULL')
      // Aucune sous-transaction "commission cash"
      .andWhere(qb2 => {
        const sub = qb2.subQuery()
          .select('1')
          .from(TransactionSavingsAccount, 'txc')
          .leftJoinAndSelect('txc.transactionType', 'ttc')
          .where('txc.tx_parent_id = tx.id')
          .andWhere('ttc.code LIKE :commission_code')
          .getQuery();
        return `NOT EXISTS ${sub}`;
      }, { commission_code: '%COMMISSION_CASH%' })
      .orderBy('tx.created_at', 'DESC')
      const [rows, total] = await qb.getManyAndCount();
      const mendo_co_sa = await this.get_mendo_co_sa_from_env();

      await this.repo.manager.transaction(async (entity_manager) => {
        for (const tx of rows) {
          console.log('tx.id ',tx.id)
          const { id, commission, ...tx_data } = tx;
          const chanel_open_product = await this.get_api_channel();
          const admin_sa = await this.get_admin_sa_for_tx(tx);
          await this.maybe_create_tx_commission_cash_pair(
            entity_manager,
            tx,
            admin_sa,
            mendo_co_sa,
          );  
          await this.update_balances_after_validate(tx, admin_sa, null, null, [], mendo_co_sa);
        }
      })


    return rows;
  }

}
