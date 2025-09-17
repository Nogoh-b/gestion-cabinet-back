import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransactionDispute, DisputeStatus, DisputeSeverity } from './entities/transaction-dispute.entity';
import { PaymentStatus } from '../transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingsAccountService } from '../transaction_saving_account/transaction_saving_account.service';
import { SearchDisputeQueryDto } from './dto/create-transaction-dispute.dto';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { TransactionDisputeDto } from './dto/response-transaction-dispute.dto';

@Injectable()
export class TransactionDisputeService {
  constructor(
    @InjectRepository(TransactionDispute)
    private disputeRepository: Repository<TransactionDispute>,
    @Inject(forwardRef(() => TransactionSavingsAccountService))
    private transactionSavingsAccountService: TransactionSavingsAccountService,
    private paginationService: PaginationService,
    private dataSource: DataSource,
  ) {}

  async createDisputeForProblematicTransaction(transaction_id: number, description?: string): Promise<TransactionDisputeDto> {
    const transaction = await this.transactionSavingsAccountService.findOne(transaction_id/*{
      where: { status: 1, has_issue: true, id: transaction_id }
    }*/);

    if (!transaction || (transaction && transaction.status != PaymentStatus.SUCCESSFULL && transaction.has_issue)) throw new Error('Transaction non trouvée ou non éligible');

    const existingDispute = await this.disputeRepository.findOne({ where: { transaction_id } });
    if (existingDispute) return plainToInstance(TransactionDisputeDto,existingDispute);

    const dispute = this.disputeRepository.create({
      transaction_id,
      transaction,
      status: DisputeStatus.OPEN,
      severity: this.calculateSeverity(transaction.amount),
      description: description || `Dispute automatique pour transaction ${transaction_id}`,
    });

    transaction.has_issue = true;
    await this.transactionSavingsAccountService.update(transaction);

    return plainToInstance(TransactionDisputeDto, this.disputeRepository.save(dispute)) ;

  }

  private calculateSeverity(amount: number): DisputeSeverity {
    if (amount <= 10000) return DisputeSeverity.LOW;
    if (amount <= 20000) return DisputeSeverity.MEDIUM;
    if (amount <= 200000) return DisputeSeverity.HIGH;
    return DisputeSeverity.CRITICAL;
  }

  async updateDisputeStatus(disputeId: number, status: DisputeStatus, resolutionNotes?: string): Promise<any> {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId }, relations:['transaction'] });
    if (!dispute || dispute.status != DisputeStatus.OPEN) throw new NotFoundException('Dispute non trouvée ou reglée');
    dispute.status = status;
    dispute.resolution_notes = resolutionNotes ?? ''; 
    dispute.resolution_date = new Date();
    dispute.closed_at = new Date();
    let tx = await this.transactionSavingsAccountService.findOne(dispute.transaction_id)
    // tx.has_issue = dispute.status != DisputeStatus.REJECTED
    tx.is_resolved = dispute.status === DisputeStatus.RESOLVED
    tx.status_issue = dispute.status
    await this.transactionSavingsAccountService.update(tx);


    return plainToInstance(TransactionDisputeDto, this.disputeRepository.save(dispute)) ;
  }

  async findOpenDisputes(): Promise<TransactionDispute[]> {
    return this.disputeRepository.find({
      where: { status: DisputeStatus.OPEN },
      relations: ['transaction']
    });
  }

  async assignDispute(disputeId: number, assigned_to_id: number): Promise<TransactionDispute> {
    const dispute = await this.disputeRepository.findOne({ where: { id: disputeId } });
    if (!dispute) throw new Error('Dispute non trouvée');

    dispute.assigned_to_id = assigned_to_id;
    dispute.status = DisputeStatus.IN_REVIEW;

    return this.disputeRepository.save(dispute);
  }

  async findAll(query: SearchDisputeQueryDto): Promise<PaginatedResult<TransactionDispute>> {
    const {
      page = 1,
      limit = 10,
      status,
      severity,
      from,
      to,
      term,
      fields,
      exact,
      provider_code,
      reference,
      payment_code,
    } = query;

    const qb = this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.transaction', 'transaction')
      .leftJoinAndSelect('transaction.provider', 'provider')
      .leftJoinAndSelect('transaction.transactionType', 'transactionType')
      .leftJoinAndSelect('transaction.originSavingsAccount', 'originSavingsAccount')
      .leftJoinAndSelect('originSavingsAccount.customer', 'originCustomer')
      .leftJoinAndSelect('transaction.targetSavingsAccount', 'targetSavingsAccount')
      .leftJoinAndSelect('targetSavingsAccount.customer', 'targetCustomer');

    if (status) qb.andWhere('dispute.status = :status', { status });
    if (severity) qb.andWhere('dispute.severity = :severity', { severity });

    // 🔹 Filtres temporels
    if (from) qb.andWhere('dispute.created_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('dispute.created_at <= :to', { to: new Date(to) });

    if (provider_code) qb.andWhere('transaction.provider_code = :provider_code', { provider_code });
    if (reference) qb.andWhere('transaction.reference = :reference', { reference });
    if (payment_code) qb.andWhere('transaction.payment_code = :payment_code', { payment_code });

    const options: PaginationOptions & { search?: SearchOptions; dateRange?: DateRange } = { page, limit };
    if (term) {
      options.search = {
        term,
        fields: Array.isArray(fields)
          ? fields
          : fields
            ? [fields]
            : [
                'provider.name',
                'transactionType.code',
                'originCustomer.fullName',
                'targetCustomer.fullName',
              ],
        exact,
      };
    }

    qb.orderBy('dispute.created_at', 'DESC');

    const paginated = await this.paginationService.paginate(qb, options);
    return paginated

    /*const mappedItems: TransactionDisputeDto[] = paginated.data.map(d => ({
      id: d.id,
      status: d.status,
      severity: d.severity,
      description: d.description ?? undefined,
      resolution_notes: d.resolution_notes ?? undefined,
      assigned_to_id: d.assigned_to_id ?? undefined, // <-- transforme null en undefined
      resolution_date: d.resolution_date ?? undefined,
      created_at: d.created_at,
      updated_at: d.updated_at,
      closed_at: d.closed_at ?? undefined,
      transaction: d.transaction
        ? {
            id: d.transaction.id,
            amount: d.transaction.amount,
            status: d.transaction.status,
            payment_code: d.transaction.payment_code,
            reference: d.transaction.reference,
            provider_code: d.transaction.provider_code,
          }
        : undefined,
      }));

      return {
        ...paginated,
        data: mappedItems,
      };*/
  }


  async findOne(id: number): Promise<TransactionDisputeDto> {
    const dispute = await this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.transaction', 'transaction')
      .where('dispute.id = :id', { id })
      .getOne();

    if (!dispute) {
      throw new NotFoundException(`Dispute with ID ${id} not found`);
    }

    // Convertir d'abord en objet plain
    const plainDispute = instanceToPlain(dispute);
    
    // Puis convertir en DTO
    return plainToInstance(TransactionDisputeDto, plainDispute);
  }

  async findOneByReference(reference: string): Promise<TransactionDisputeDto> {
    const dispute = await this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.transaction', 'transaction')
      .where('transaction.reference = :reference', { reference })
      .getOne();

    if (!dispute) {
      throw new NotFoundException(`Aucune dispute trouvée pour la référence: ${reference}`);
    }

    return plainToInstance(TransactionDisputeDto, dispute);
  }



}
