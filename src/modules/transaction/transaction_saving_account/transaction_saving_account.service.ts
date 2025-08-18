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
import { Not, Repository } from 'typeorm';

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
import {
  Payment,
  PaymentStatus,
  PaymentStatusProvider,
  TransactionSavingsAccount,
  TransactionSavingsAccountStatus,
} from './entities/transaction_saving_account.entity';

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
      throw new BadRequestException(`Transfert vers le même compte interdit `);
    }
    // récupération du compte origine
    let origin: SavingsAccount | null = null;
    if (
      (dto as CreateTransactionSavingsAccountDto).origin_savings_account_code
    ) {
      origin = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCode(
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
        await this.savingsAccountService.findOneByCode(
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
        if (this.can_refuse_transaction_type_for_debit(txType.code))
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
    tx.status = origin && dayBeforeWithdraw === 0 ? 1 : 0;
    tx.branch_id = dto.branch_id ?? null;
    tx.channelTransaction = channel;
    tx.provider = provider;
    tx.commission = dto.commission ?? 0;
    tx.transactionType = txType;
    tx.ressource = ressource;
    tx.origin = origin?.number_savings_account
      ? origin?.number_savings_account
      : 'SYTEM';
    tx.target = target?.number_savings_account ?? 'SYSTEM';
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
      txType.code === TransactionCode.INTERNAL_TRANSFER
    ) {
      this.validate(tx.id, isFirstTx);
      tx.status = 1;
    }
    const tx1 = await this.repo.save(tx);
    console.log('txxxxxxxx ', tx1.id, ' ', tx1.channelTransaction.code);

    return plainToInstance(ResponseTransactionSavingsAccountDto, tx);
  }

  can_refuse_transaction_type_for_debit(txTypeCode) {
    return (
      txTypeCode === TransactionCode.INTERNAL_TRANSFER ||
      txTypeCode?.includes('_WITHDRAW')
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

  async momo_deposit(dto: CreateCreditTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'MOMO_DEPOSIT',
      'MOBILE',
      TransactionProvider.MOMO,
    );
  }

  async om_withdraw(dto: CreateDebitTransactionSavingsAccountDto) {
    dto.status = PaymentStatus.SUCCESSFULL;
    return await this.perform_transaction(
      dto,
      'OM_WITHDRAW',
      'MOBILE',
      TransactionProvider.OM,
    );
  }

  async momo_withdraw(dto: CreateDebitTransactionSavingsAccountDto) {
    dto.status = PaymentStatus.SUCCESSFULL;
    return await this.perform_transaction(
      dto,
      'MOMO_WITHDRAW',
      'MOBILE',
      TransactionProvider.MOMO,
    );
  }

  async om_deposit(dto: CreateCreditTransactionSavingsAccountDto) {
    return await this.perform_transaction(
      dto,
      'OM_DEPOSIT',
      'MOBILE',
      TransactionProvider.OM,
    );
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
    const channel_code = dto.branch_id ? 'BRANCH' : 'MOBILE';
    return await this.perform_transaction(
      dto,
      'INTERNAL_TRANSFER',
      channel_code,
      'SYSTEM',
    );
  }

  async checkStatusPayment(reference: string): Promise<any> {
    const tx = await this.repo.findOne({
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
    const sa = await this.savingsAccountService.findOneByCode(
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
      console.log('payment', payment);
      tx.status_provider = payment.paymentStatus;
      tx.status = PaymentStatus.PENDING;
      const dataPayment: Payment = payment.data;
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
      account != null &&
      avalaible_balance < amount &&
      this.can_refuse_transaction_type_for_debit(txTypeCode)
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

    // 2. Vérifier le solde minimum (pour les retraits)
    /*if (
        avalaible_balance - amount <
        account!.type_savings_account.minimum_balance &&
        !is_credit
      ) {
        throw new BadRequestException(
          `Solde insuffisant. Minimum requis: ${account?.type_savings_account.minimum_balance}`,
        );
      }

      // 3. Vérifier la durée de blocage (ex: 6 mois)
      const accountAgeMonths = this.getAccountAgeMonths(
        account!.type_savings_account.created_at,
      );
      if (
        accountAgeMonths < account!.type_savings_account.minimum_blocking_duration
      ) {
        throw new BadRequestException(
          `Durée de blocage non atteinte (${account!.type_savings_account.minimum_blocking_duration} mois requis)`,
        );
      }*/

    // 4. Calculer les frais (ex: commission_per_product devenu account_opening_fee)
    const totalFees = account.type_savings_account.account_opening_fee; // + autres frais si besoin
    return { isValid: true, fees: totalFees };
  }

  private getAccountAgeMonths(createdAt: Date): number {
    const today = new Date();
    const months = (today.getFullYear() - createdAt.getFullYear()) * 12;
    return months + today.getMonth() - createdAt.getMonth();
  }
  async isFirstTransaction(target?: SavingsAccount | null) {
    /* const min_blances = await this.findAllByTypeSimple('0','MIN_BALANCE',target?.number_savings_account)
    console.log(min_blances) 
    return min_blances.length === 0*/
    console.log('isFirstTransaction ', target?.targetSavingsAccountTx);
    if (target?.is_admin) {
      return false;
    }
    if (target && (!target.targetSavingsAccountTx || target?.is_admin))
      return true;

    let hasFirstDeposit = true;
    if (target) {
      for (const tx of target.targetSavingsAccountTx || []) {
        if (tx.status === PaymentStatus.SUCCESSFULL) {
          hasFirstDeposit = false;
          break; // Sortie immédiate de la boucle
        }
      }
    }
    return hasFirstDeposit;
    // return target && target.status === SavingsAccountStatus.PENDING && !!tx.transactionType.is_credit && hasFirstDeposit
  }

  async validate(
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
            provider: 'OM',
            isCredit: entity.origin ? 0 : 1,
            amount: entity.amount + (entity.commission ?? 0),
          },
        );
        console.log('sold provider updated', updated_sold);
      }
    }
    let target: SavingsAccount | null = null; // Initialisation explicite à null
    const tx = await this.repo.save(entity);

    console.log(
      'payment suscessful----- ',
      isFirstTx,
      '-----',
      tx.id,
      ' ',
      tx.status_provider,
    );
    if (tx.targetSavingsAccount)
      target = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCode(
          tx.targetSavingsAccount.number_savings_account,
        ),
      );
    let comercial: Personnel | null = new Personnel();
    let partner: Personnel | null = new Personnel();
    let adminSa: SavingsAccount | null = new SavingsAccount();
    if (target) {
      adminSa = await this.savingsAccountService.findOneAdmin(
        target?.branch_id,
      );
    }

    let mendoCoSa: SavingsAccount | null = null;
    if (process.env.MENDO_CO_CODE_SAVINGS_ACCOUNT) {
      mendoCoSa = plainToInstance(
        SavingsAccount,
        await this.savingsAccountService.findOneByCode(
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
        const txTypeMinBalance =
          await this.transactionTypeService.findOneByCode('MIN_BALANCE');
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

        await entityManager.save(secondTx);
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
    if (txType.is_credit) {
      tx.origin = dto.phoneNumber;
    } else {
      tx.target = dto.phoneNumber;
    }
    if (tx.originSavingsAccount)
      tx.status_provider = PaymentStatusProvider.SUCCESSFULL;
    tx.payment_token_provider =
      dto.payment_token_provider ?? this.generateUniquePaymentTokenProvider();
    tx.payment_code = dto.payment_code ?? this.generateUniquePaymentCode();
    this.repo.save(tx);
    // const isFirstTx = await  this.isFirstTransaction(tx.targetSavingsAccount)
    if (channel_code === 'MOBILE' && Boolean(txType.is_credit)) {
      let isFirstTx = false;
      // if(tx.targetSavingsAccount){

      const sa = await this.savingsAccountService.findOneByCode(
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
        tx.status =
          PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
        if (txType.is_credit) {
          tx.origin = dataPayment.ref;
        } else {
          tx.target = dataPayment.ref;
        }
        if (tx.status === PaymentStatus.SUCCESSFULL) {
          tx = await this.validate(tx.id, isFirstTx);
        }
        console.log('is_credit ', dataPayment.ref);

        // this.repo.save(tx);
        console.log(
          dataPayment.paymentStatus,
          ' === ',
          PaymentStatusProvider.PENDING,
        );
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
}
