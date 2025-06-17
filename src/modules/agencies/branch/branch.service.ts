import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { GenCOde } from 'src/core/shared/utils/generation.util';
import { LocationCitiesService } from 'src/modules/geography/location_city/location_city.service';
import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';









import { TransactionChannel } from 'src/modules/transaction/transaction_type/entities/transaction_type.entity';













import { Repository } from 'typeorm';


import { Injectable, NotFoundException } from '@nestjs/common';




import { InjectRepository } from '@nestjs/typeorm';





import { Employee } from '../employee/entities/employee.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Branch } from './entities/branch.entity';


































@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    private locationCityService: LocationCitiesService,
  ) {}
  // Branches
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    // Vérification de l'existence de la ville
    const city = await this.locationCityService.findOne(dto.location_city_id);

    if (!city) {
      throw new NotFoundException('Ville non trouvée');
    }
    let code: string;
    let attempts = 0;
    do {
      code = GenCOde.randomDigits(2);
      attempts++;
    } while (!(await this.isBranchCodeUnique(code)) && attempts < 10);

    if (attempts >= 5) {
      throw new Error('Échec de génération d’un code de la branche');
    }
    dto.code = code;
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
    if (dto.location_city_id) {
      const city = await this.locationCityService.findOne(dto.location_city_id);

      if (!city) {
        throw new NotFoundException(
          `City with ID ${dto.location_city_id} not found`,
        );
      }
      existingBranch.location_city = city;
      delete dto.location_city_id; // Pour éviter de l'envoyer deux fois
    }

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

  async findOne(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    return branch;
  }

  async findEmployeesByBranchId(id: number): Promise<Employee[]> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
      relations: ['employees'],
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    return branch.employees;
  }

  async activate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 0 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch!.status = 1;
    branch?.save();
    return branch;
  }
  async deactivate(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id, status: 1 },
    });
    if (!branch) throw new NotFoundException('Branch inexistante');
    branch!.status = 0;
    branch?.save();
    return branch;
  }

  async stats(id: number): Promise<any> {
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
const branch = await this.branchRepository
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
          if(account?.is_admin){
            outgoingTransactionsBranch.push(tx) 
            outgoingAmountBranch += tx.amount; 
          }
          else{
            if(tx.channelTransaction.code != TransactionChannel.API)
              outgoingTransactionsCustomer.push(tx)  
              outgoingAmountCustomer += tx.amount; 

          }
        });
    }
    if (account.targetSavingsAccountTx) {
       account.targetSavingsAccountTx?.forEach((tx) => {
          if(account?.is_admin){
            incomingTransactionsBranch.push(tx)  
            inComingAmountBranch += tx.amount; 
          }
          else{
            if(tx.channelTransaction.code != TransactionChannel.API)
              incomingTransactionsCustomer.push(tx)  
              inComingAmountCustomer += tx.amount; 
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
    };

  }
}
