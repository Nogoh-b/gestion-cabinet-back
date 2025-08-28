import { PaginatedResult } from 'src/core/shared/interfaces/pagination.interface';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';

import { SavingsAccountResponseDto } from 'src/modules/savings-account/savings-account/dto/response-savings-account.dto';

import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { TransactionSavingsAccountStatus } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';

import { TransactionProvider } from 'src/modules/transaction/transaction_type/entities/transaction_type.entity';
import { Repository } from 'typeorm';
import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { EmployeeResponseDto } from '../employee/dto/response-employee.dto';
import { EmployeeService } from '../employee/employee.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Branch } from './entities/branch.entity';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @Inject(forwardRef(() => SavingsAccountService))
    private savingsAccountService: SavingsAccountService,
    private locationCityService: LocationCitiesService,
    private employeeService: EmployeeService,
  ) {
    console.log(forwardRef);
  }
  // Branches
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    // Vérification de l'existence de la ville
    const city = await this.locationCityService.findOne(dto.location_city_id);

    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }
    const code: string = await this.generateNextBranchCode();
    /*let attempts = 0;
    do {
      code = GenCOde.randomDigits(3);
      attempts++;
    } while (!(await this.isBranchCodeUnique(code)) && attempts < 10);

    if (attempts >= 5) {
      throw new Error('Échec de génération d’un code de la branche');
    }*/
    dto.code = await this.generateNextBranchCode();
    await validateDto(CreateBranchDto, dto);
    const branch = this.branchRepository.create({
      ...dto,
      code,
      location_city: city, // Assignation de l'entité complète
    });
    return await this.branchRepository.save(branch);
  }

  async findAllBranches(status = 1): Promise<Branch[]> {
    return this.branchRepository.find({
      relations: ['location_city'],
      where: { status },
    });
  }

  async updateBranch(id: number, dto: UpdateBranchDto): Promise<Branch> {
    // 1. Vérifier l'existence de la branche
    const existingBranch = await this.branchRepository.findOneBy({ id });
    if (!existingBranch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }

    // 2. Si location_city_id est fourni dans le DTO
    /*if (dto.location_city_id) {
      const city = await this.locationCityService.findOne(dto.location_city_id);

      if (!city) {
        throw new NotFoundException(
          `City with ID ${dto.location_city_id} not found`,
        );
      }
      existingBranch.location_city = city;
      delete dto.location_city_id; // Pour éviter de l'envoyer deux fois
    }*/

    // 3. Fusionner les modifications
    this.branchRepository.merge(existingBranch, dto);

    // 4. Sauvegarder et retourner l'entité complète
    return await this.branchRepository.save(existingBranch);
  }

  async deleteBranch(id: number): Promise<void> {
    await this.branchRepository.delete(id);
  }
  async isBranchCodeUnique(code: string): Promise<boolean> {
    const existing = await this.branchRepository.findOne({ where: { code } });
    return !existing;
  }

  async findOne(id: number, all = false): Promise<Branch> {
    const relations = all ? ['employees', 'savingsAccounts', 'customers'] : [];
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
      relations,
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    return branch;
  }

  async findEmployeesByBranchId(id: number): Promise<EmployeeResponseDto[]> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
      relations: ['employees', 'employees'],
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    this.employeeService.findAllEmployees(branch.id);
    return await this.employeeService.findAllEmployees(branch.id);
  }

  async activate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 0 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch.status = 1;
    branch?.save();
    return branch;
  }
  async deactivate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch.status = 0;
    branch?.save();
    return branch;
  }

  async findAllSavingAccounts(
    branch_id: number = 0,
    isDeactivate: boolean = false,
    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,
  ): Promise<PaginatedResult<SavingsAccountResponseDto>> {
    return await this.savingsAccountService.findAll(
      false,
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fields,
      exact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,
    );
  }

  async stats(id: number): Promise<any> {
    const branch = await this.findOne(id, true);

    const txs = await this.savingsAccountService.findAllTrans(id);

    const stats = {
      online: {
        om: {
          transactionCountIncomming: 0,
          transactionAmountIncomming: 0,
          transactionCountOutcomming: 0,
          transactionAmountOutcomming: 0,
          balance: 0,
        },
        momo: {
          transactionCountIncomming: 0,
          transactionAmountIncomming: 0,
          transactionCountOutcomming: 0,
          transactionAmountOutcomming: 0,
          balance: 0,
        },
        savings_accounts: 0,
        customer: 0,
        transactionCountIncomming: 0,
        transactionAmountIncomming: 0,
        transactionCountOutcomming: 0,
        transactionAmountOutcomming: 0,
        balance: 0,
      },
      agency: {
        transactionCountIncomming: 0,
        customer: 0,
        transactionAmountIncomming: 0,
        transactionCountOutcomming: 0,
        transactionAmountOutcomming: 0,
        savings_accounts: 0,
        balance: 0,
      },
      global: {
        customer: 0,
        savings_accounts: 0,
        employees: 0,
        transactionCountIncomming: 0,
        transactionAmountIncomming: 0,
        transactionCountOutcomming: 0,
        transactionAmountOutcomming: 0,
        balance: 0,
      },
    };

    for (const tx of txs) {
      if (tx.status != TransactionSavingsAccountStatus.VALIDATE || tx.is_locked)
        continue;
      // transactions entrantes
      if (tx.targetSavingsAccount && !tx.originSavingsAccount) {
        stats.global.transactionAmountIncomming += tx.amount;
        stats.global.transactionCountIncomming++;
        if (
          (!tx.branch_id && tx.provider.code === TransactionProvider.MOMO) ||
          tx.provider.code === TransactionProvider.OM
        ) {
          stats.online.transactionAmountIncomming += tx.amount;
          stats.online.transactionCountIncomming++;
        } else if (tx.branch_id) {
          stats.agency.transactionAmountIncomming += tx.amount;
          stats.agency.transactionCountIncomming++;
        }
        if (tx.provider.code === TransactionProvider.MOMO) {
          stats.online.momo.transactionAmountIncomming += tx.amount;
          stats.online.momo.transactionCountIncomming++;
        } else if (tx.provider.code === TransactionProvider.OM) {
          stats.online.om.transactionAmountIncomming += tx.amount;
          stats.online.om.transactionCountIncomming++;
        }
      }
      // transactions sortante
      if (!tx.targetSavingsAccount && tx.originSavingsAccount) {
        stats.global.transactionAmountOutcomming += tx.amount;
        stats.global.transactionCountOutcomming++;
        if (
          (!tx.branch_id && tx.provider.code === TransactionProvider.MOMO) ||
          tx.provider.code === TransactionProvider.OM
        ) {
          stats.online.transactionAmountOutcomming += tx.amount;
          stats.online.transactionCountOutcomming++;
        } else if (tx.branch_id) {
          stats.agency.transactionAmountOutcomming += tx.amount;
          stats.agency.transactionCountOutcomming++;
        }
        if (tx.provider.code === TransactionProvider.MOMO) {
          stats.online.momo.transactionAmountOutcomming += tx.amount;
          stats.online.momo.transactionCountOutcomming++;
        } else if (tx.provider.code === TransactionProvider.OM) {
          stats.online.om.transactionAmountOutcomming += tx.amount;
          stats.online.om.transactionCountOutcomming++;
        }
      }
      stats.agency.balance =
        stats.agency.transactionAmountIncomming -
        stats.agency.transactionAmountOutcomming;
      stats.global.balance =
        stats.global.transactionAmountIncomming -
        stats.global.transactionAmountOutcomming;
      stats.online.balance =
        stats.online.transactionAmountIncomming -
        stats.online.transactionAmountOutcomming;
      stats.online.momo.balance =
        stats.online.momo.transactionAmountIncomming -
        stats.online.momo.transactionAmountOutcomming;
      stats.online.om.balance =
        stats.online.om.transactionAmountIncomming -
        stats.online.om.transactionAmountOutcomming;
    }

    // return branch
    if (branch) {
      stats.global.savings_accounts = branch.savingsAccounts.length;
      stats.global.employees = branch.employees.length;
      for (const sa of branch?.savingsAccounts) {
        if (sa.created_online == 1) {
          stats.online.savings_accounts++;
        } else {
          stats.agency.savings_accounts++;
        }
      }
    }
    return stats;

    console.log('stats');
    const branch1 = await this.branchRepository.findOne({
      where: { id, status: 1 },
      relations: [
        'employees',
        'savingsAccounts',
        'savingsAccounts.originSavingsAccountTx', // Transactions sortantes
        'savingsAccounts.targetSavingsAccountTx', // Transactions entrantes
      ],
    });
    /*const branch = await this.branchRepository
    .createQueryBuilder('branch')
    // Jointure UNIQUE pour savingsAccounts
    .leftJoinAndSelect('branch.savingsAccounts', 'savingsAccount', 'savingsAccount.branch.id = :branchId', { branchId: id })
    // Jointure pour employees (si nécessaire)
    .leftJoinAndSelect('branch.employees', 'employee') // Alias différent de 'savingsAccount'
    // Jointures pour les transactions sortantes (outgoingTx)
    .leftJoinAndSelect('savingsAccount.originSavingsAccountTx', 'outgoingTx')
    .leftJoinAndSelect('outgoingTx.originSavingsAccount', 'originAccount')
    .leftJoinAndSelect('outgoingTx.targetSavingsAccount', 'targetAccount')
    .leftJoinAndSelect('outgoingTx.channelTransaction', 'channel')
    .leftJoinAndSelect('outgoingTx.provider', 'provider')
    .leftJoinAndSelect('outgoingTx.transactionType', 'transactionType')
    // Jointures pour les transactions entrantes (incomingTx)
    .leftJoinAndSelect('savingsAccount.targetSavingsAccountTx', 'incomingTx')
    .leftJoinAndSelect('incomingTx.originSavingsAccount', 'originAccount1')
    .leftJoinAndSelect('incomingTx.targetSavingsAccount', 'targetAccount1')
    .leftJoinAndSelect('incomingTx.channelTransaction', 'channel1')
    .leftJoinAndSelect('incomingTx.provider', 'provide1r')
    .leftJoinAndSelect('incomingTx.transactionType', 'transactionType1')
    // (Optionnel) Ajoutez les mêmes relations pour incomingTx si besoin :
    .leftJoinAndSelect('incomingTx.originSavingsAccount', 'incomingOriginAccount')
    .leftJoinAndSelect('incomingTx.targetSavingsAccount', 'incomingTargetAccount')
    .where('branch.id = :id AND branch.status = 1', { id })
    .getOne();
    let  sa = branch?.savingsAccounts
    let outgoingTransactionsCustomer: TransactionSavingsAccount[] = []; 
    let incomingTransactionsCustomer : TransactionSavingsAccount[] = [] 
    let outgoingTransactionsBranch: TransactionSavingsAccount[] = []; 
    let incomingTransactionsBranch : TransactionSavingsAccount[] = [] 
    let inComingAmountCustomer = 0
    let inComingAmountBranch = 0
    let outgoingAmountCustomer = 0
    let outgoingAmountBranch = 0
    sa?.forEach((account) => {
      if (account.originSavingsAccountTx) {
          account.originSavingsAccountTx?.forEach((tx) => {

            if(tx.status === PaymentStatus.SUCCESSFULL){
              if(account?.is_admin){
                outgoingTransactionsBranch.push(tx) 
                outgoingAmountBranch += tx.amount; 
              }
              else{
                if(tx.channelTransaction.code != TransactionChannel.API)
                  outgoingTransactionsCustomer.push(tx)  
                  outgoingAmountCustomer += tx.amount; 

              }
            }


          });
      }
      if (account.targetSavingsAccountTx) {
        account.targetSavingsAccountTx?.forEach((tx) => {

            if(tx.status === PaymentStatus.SUCCESSFULL){
              if(account?.is_admin){
                incomingTransactionsBranch.push(tx)  
                inComingAmountBranch += tx.amount; 
              }
              else{
                if(tx.channelTransaction.code != TransactionChannel.API)
                  incomingTransactionsCustomer.push(tx)  
                  inComingAmountCustomer += tx.amount; 
              }
            }
          });
      }

    });

    return {
      employeeCount: branch?.employees.length,
      savingsAccountCount: branch?.savingsAccounts.length,
      incomingTransactionsCustomer: incomingTransactionsCustomer.length,
      outgoingTransactionsCustomer: outgoingTransactionsCustomer.length,
      incomingTransactionsBranch: incomingTransactionsBranch.length,
      outgoingTransactionsBranch: outgoingTransactionsBranch.length,
      inComingAmountCustomer,
      outgoingAmountCustomer,
      inComingAmountBranch,
      outgoingAmountBranch,
    };*/
  }

  /**
   * Génère le prochain code de branche incrémental sur 3 chiffres (000 à 999).
   */
  async generateNextBranchCode(): Promise<string> {
    // 1) Récupère la valeur max des 3 derniers caractères de `code`
    const raw = await this.branchRepository
      .createQueryBuilder('b')
      .select('MAX(CAST(RIGHT(b.code, 3) AS UNSIGNED))', 'max')
      .getRawOne<{ max: string }>();

    // 2) Convertit en number (ou 0 si table vide)
    const maxValue = raw?.max ? parseInt(raw.max, 10) : 0;

    // 3) Incrémente, et vérifie qu’on reste sous 1000
    const next = maxValue + 1;
    if (next > 999) {
      throw new Error(
        'Impossible de générer un nouveau code : seuil maximal (999) atteint',
      );
    }

    // 4) Formate sur 3 chiffres
    return next.toString().padStart(3, '0');
  }
}
