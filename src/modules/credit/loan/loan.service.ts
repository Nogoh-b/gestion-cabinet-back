import { CronJob } from 'cron';
import { In, Repository } from 'typeorm';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { UPLOAD_DOCS_PATH } from '../../../core/common/constants/constants';
import { JobsService } from '../../../core/scheduler/jobs.service';
import { FilesUtil } from '../../../core/shared/utils/file.util';
import {
  CREDIT_STATE,
  CREDIT_STATUS,
  MODE_REIMBURSEMENT_PERIOD,
} from '../../../utils/types';
import { getCronTime } from '../../../utils/utils';
import { EmployeeService } from '../../agencies/employee/employee.service';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from '../../documents/document-customer/entities/document-customer.entity';
import { DocumentTypeService } from '../../documents/document-type/document-type.service';
import { User } from '../../iam/user/entities/user.entity';
import { SavingsAccountService } from '../../savings-account/savings-account/savings-account.service';
import { CreateCreditTransactionSavingsAccountDto } from '../../transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from '../../transaction/transaction_saving_account/transaction_saving_account.service';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { GuarantyEstimationService } from '../guaranty/garanty_estimation/guaranty_estimation.service';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';
import { DocumentLoanDto, GuarantyDocumentLoanDto } from './dto/loan.dto';
import { Loan } from './entities/loan.entity';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class LoanService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(DocumentCustomer)
    private readonly documentCustomerRepository: Repository<DocumentCustomer>,
    private readonly documentTypeService: DocumentTypeService,
    private readonly guarantyEstimationService: GuarantyEstimationService,
    private readonly transactionSavingAccountService: TransactionSavingsAccountService,
    private readonly jobsService: JobsService,
    private readonly employeeService: EmployeeService,
    private readonly savingAccountService: SavingsAccountService,
  ) {}

  async findAllLoans() {
    return await this.loanRepository.find({
      relations: {
        customer: true,
        typeCredit: true,
      },
    });
    //.map((loan) => ({ ...loan, customer: { id: customerId } }));
  }

  async findAllLoansByCustomerId(customerId: number) {
    return await this.loanRepository.find({
      relations: {
        customer: true,
        typeCredit: true,
      },
      where: { customer: { id: customerId } },
    });
    //.map((loan) => ({ ...loan, customer: { id: customerId } }));
  }

  async findOneLoanByCustomerId(id: number, customerId: number) {
    const loan = await this.loanRepository.findOne({
      relations: {
        customer: true,
        typeCredit: {
          typeGuaranties: { typeOfDocument: true },
          typeOfDocuments: true,
        },
        guaranties: { documents: true },
        documents: true,
      },
      where: {
        id,
        customer: { id: customerId },
      },
    });
    if (!loan)
      return {
        success: false,
        message: 'No Loan Found',
        status: HttpStatus.NOT_FOUND,
      };
    return loan;
  }

  async findTransactionsLoanByCustomerId(id: number, customerId: number) {
    const loan = await this.loanRepository.findOne({
      where: {
        id,
        customer: { id: customerId },
      },
      relations: {
        transactions: true,
      },
    });
    if (!loan)
      return {
        success: false,
        message: 'No Loans Found',
        status: HttpStatus.NOT_FOUND,
      };
    const { transactions } = loan;
    return transactions;
  }

  async setApprovedLoanByCustomerId(loan: Loan, user: any) {
    const creditAccount = loan.credit_account;
    const customer = loan.customer;
    const typeCredit = loan.typeCredit;
    const employee = await this.employeeService.findOne(user.userId as number);
    if (!employee)
      throw new BadRequestException({
        success: false,
        message: 'This user is not a employee, please contact administrator',
        status: HttpStatus.BAD_REQUEST,
      });
    const agency = employee.branch;
    if (!agency)
      throw new BadRequestException({
        success: false,
        message:
          'No system to approve, branch not identify in this user, please contact administrator',
        status: HttpStatus.BAD_REQUEST,
      });

    const savingAccountAgency = await this.savingAccountService.findOneAdmin(
      agency.id,
    );
    const valid = await this.updateLoanByCustomerId(
      loan,
      {
        state: CREDIT_STATE.ACTIVE,
        status: CREDIT_STATUS.APPROVED,
        approvedBy: { id: user.userId as number } as User,
        nextDatePrevalent: new Date(
          Date.now() + typeCredit.reimbursement_period * 20 * 1000,
        ),
      },
      false,
    );
    if (valid.hasOwnProperty('success')) return valid;

    const transaction =
      await this.transactionSavingAccountService.deposit_loan_to_account({
        amount: loan.amount,
        branch_id: agency.id,
        target_savings_account_code: creditAccount.number_savings_account,
        loanId: loan.id,
      } as CreateCreditTransactionSavingsAccountDto);

    const time = getCronTime(
      transaction.created_at,
      typeCredit.reimbursement_period,
    );
    this.jobsService.addCronJob(
      'loan-' + loan.id,
      process.env.NODE_ENV === 'development' ? `*/20 * * * * *` : time,
      async () => {
        const result = await this.getLoanInProcessingOrActive(customer.id);
        const loan = result as Loan;
        const savingAccount =
          await this.savingAccountService.findOneHydridSavingByCustomer(
            loan.customer.id,
          );
        const periodic = loan.typeCredit.reimbursement_period;
        const [name, task] = this.jobsService.getCronJob('loan-' + loan.id) as [
          string,
          CronJob,
        ];
        console.log({
          id: name,
          periodic,
          next: task.nextDate().toJSDate(),
          current: new Date(),
          preleventDay: loan.nextDatePrevalent,
          remain: loan.remainPaymentNumber,
          amount: loan.remainTotalAmount,
          trait: loan.reimbursement_amount,
          penalityAmount: loan.totalAmountPenality,
          numberOfPenality: loan.numberOfPenality,
        });
        const in_Period =
          periodic === MODE_REIMBURSEMENT_PERIOD.BIWEEKLY ||
          periodic === MODE_REIMBURSEMENT_PERIOD.DAILY_2 ||
          periodic === MODE_REIMBURSEMENT_PERIOD.DAILY_3 ||
          periodic === MODE_REIMBURSEMENT_PERIOD.DAILY_4 ||
          periodic === MODE_REIMBURSEMENT_PERIOD.DAILY_5 ||
          periodic === MODE_REIMBURSEMENT_PERIOD.DAILY_6;
        const isDay = process.env.NODE_ENV
          ? loan.nextDatePrevalent.getMinutes() !== new Date().getMinutes()
          : loan.nextDatePrevalent.getDate() !== new Date().getDate();
        if (in_Period && isDay) {
          return;
        }
        const amountRetrieve =
          loan.reimbursement_amount <= loan.remainTotalAmount
            ? loan.reimbursement_amount
            : loan.remainTotalAmount;
        const penalityAmount =
          amountRetrieve + (amountRetrieve * loan.typeCredit.penality) / 100;
        if (savingAccount.avalaible_balance < loan.reimbursement_amount)
          await this.transactionSavingAccountService
            .retrieve_penality_account({
              amount: penalityAmount,
              branch_id: agency.id,
              origin_savings_account_code: savingAccount.number_savings_account,
              target_savings_account_code:
                savingAccountAgency.number_savings_account,
              loanId: loan.id,
            } as CreateCreditTransactionSavingsAccountDto)
            .then((t) =>
              console.log(
                'penality ',
                t.amount,
                savingAccount.avalaible_balance,
              ),
            );
        else
          await this.transactionSavingAccountService
            .retrieve_trait_to_account({
              amount: amountRetrieve,
              branch_id: agency.id,
              origin_savings_account_code: savingAccount.number_savings_account,
              target_savings_account_code:
                savingAccountAgency.number_savings_account,
              loanId: loan.id,
            } as CreateCreditTransactionSavingsAccountDto)
            .then((t) =>
              console.log(
                'retrieve ',
                t.amount,
                savingAccount.avalaible_balance,
              ),
            );
        await this.updateLoanByCustomerId(
          loan,
          {
            nextDatePrevalent: new Date(Date.now() + periodic * 20 * 1000),
            remainPaymentNumber: --loan.remainPaymentNumber,
            remainTotalAmount: loan.remainTotalAmount - amountRetrieve,
            ...(savingAccount.avalaible_balance < loan.reimbursement_amount
              ? {
                  numberOfPenality: ++loan.numberOfPenality,
                  totalAmountPenality:
                    loan.totalAmountPenality +
                    (amountRetrieve * loan.typeCredit.penality) / 100,
                }
              : {}),
          },
          false,
        );
        if (!loan.remainPaymentNumber) {
          await this.updateLoanByCustomerId(
            loan,
            {
              state:
                savingAccount.avalaible_balance >= 0
                  ? CREDIT_STATE.COMPLETED
                  : CREDIT_STATE.INCOMPLETE,
            },
            false,
          );
          task.stop();
          this.jobsService.deleteCron('loan-' + loan.id);
          return;
        }
      },
    );
    return true;
  }

  async setRevokedLoanByCustomerId(loan: Loan, user: User) {
    return await this.updateLoanByCustomerId(
      loan,
      {
        status: CREDIT_STATUS.REJECTED,
        approvedBy: user,
      },
      false,
    );
  }

  async updateLoanByCustomerId(
    loan: Loan,
    data: Partial<Loan>,
    listen: boolean,
  ) {
    const current = await this.loanRepository.preload({ id: loan.id, ...data });
    if (!current)
      return {
        success: false,
        message: 'No Loan Found, update failed',
        status: HttpStatus.NOT_FOUND,
      };
    try {
      await this.loanRepository.save(current, { listeners: listen });
      return true;
    } catch (error) {
      return {
        success: false,
        message: 'error updating loan',
        status: HttpStatus.BAD_REQUEST,
      };
    }
  }

  async deleteLoanByCustomerId(loan: Loan) {
    if (loan.approvedBy)
      return {
        success: false,
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot delete this loan',
      };
    await this.loanRepository.softDelete(loan.id);
    return true;
  }

  async getLoanInProcessingOrActive(id: number) {
    const loan = await this.loanRepository.findOne({
      relations: {
        typeCredit: {
          typeGuaranties: { typeOfDocument: true },
          typeOfDocuments: true,
        },
        documents: true,
        transactions: true,
        guaranties: { documents: true },
        customer: { branch: true },
        credit_account: true,
        approvedBy: { employee: { branch: true } },
        managedBy: { employee: { branch: true } },
        initiated: { employee: { branch: true } },
      },
      where: {
        customer: { id },
        state: In([
          CREDIT_STATE.IN_PROCESSING,
          CREDIT_STATE.ACTIVE,
          CREDIT_STATE.END_PROCESSING,
        ]),
        status: In([CREDIT_STATUS.APPROVED, CREDIT_STATUS.PENDING]),
      },
    });
    if (!loan)
      return {
        success: false,
        message: 'No Loans Found',
        status: HttpStatus.NOT_FOUND,
      };
    return loan;
  }

  async validDocByCustomerId(doc: DocumentCustomer) {
    await this.documentCustomerRepository.update(doc.id, { status: 1 });
    return true;
  }

  async rejectDocByCustomerId(doc: DocumentCustomer) {
    await this.documentCustomerRepository.update(doc.id, { status: -1 });
    return true;
  }

  async submitLoan(loan: Loan, user: any) {
    // check if docs has validated
    const typeCredit = loan.typeCredit;
    const isDocsValid =
      typeCredit.typeOfDocuments.length &&
      (loan.documents.length
        ? loan.documents.find((doc) => !doc.status)
        : true);
    if (isDocsValid)
      return {
        success: false,
        message: 'Please valid all documents specified',
        status: HttpStatus.FORBIDDEN,
      };
    //check if guaranties has validated
    const isGuarantyValid =
      typeCredit.typeGuaranties.length &&
      (loan.guaranties.length
        ? !loan.guaranties.find(
            (guaranty) =>
              guaranty.status === CREDIT_STATUS.APPROVED &&
              guaranty.documents.status,
          )
        : true);
    if (isGuarantyValid)
      return {
        success: false,
        message: 'Please valid one guaranty specified',
        status: HttpStatus.FORBIDDEN,
      };
    return await this.updateLoanByCustomerId(
      loan,
      {
        managedBy: { id: user.userId as number } as User,
        state: CREDIT_STATE.END_PROCESSING,
      },
      false,
    );
  }

  async setGuarantiesDocumentsToLoan(
    customerId: number,
    id: number,
    typeOfDocument: number,
    guaranty: GuarantyDocumentLoanDto,
  ) {
    // create guaranties list
    const { typeGuaranty, file, ...result } = guaranty;
    const docType = await this.documentTypeService.findOne(typeOfDocument);
    const uploadedFile = await FilesUtil.uploadFile(
      file,
      UPLOAD_DOCS_PATH,
      docType.mimetype,
      {
        maxSizeKB: 1024 * 1024 * 2,
        width: 1024,
      },
    );

    const currentDoc = this.documentCustomerRepository.create({
      document_type: docType,
      customer: { id: customerId },
      file_path: uploadedFile.fileName,
      file_size: uploadedFile.fileSize,
      name: docType.name,
      status: DocumentCustomerStatus.PENDING,
    });
    const documents = await this.documentCustomerRepository.save(currentDoc);
    return await this.guarantyEstimationService.addGuarantyEstimation({
      value: Number(result.value),
      typeGuaranty: { id: typeGuaranty } as TypeGuaranty,
      documents,
      status: CREDIT_STATUS.PENDING,
      loan: { id },
    } as GuarantyEstimation);
  }

  async setTypeDocumentsToLoan(
    customerId: number,
    id: number,
    body: DocumentLoanDto,
  ) {
    // create document list
    const { file } = body;
    const docType = await this.documentTypeService.findOne(body.typeOfDocument);
    const uploadedFile = await FilesUtil.uploadFile(
      file,
      UPLOAD_DOCS_PATH,
      docType.mimetype,
      {
        maxSizeKB: 1024 * 1024 * 2,
        width: 1024,
      },
    );

    const currentDoc = this.documentCustomerRepository.create({
      loan: { id },
      document_type: docType,
      customer: { id: customerId },
      file_path: uploadedFile.fileName,
      file_size: uploadedFile.fileSize,
      name: docType.name,
      status: DocumentCustomerStatus.PENDING,
    });
    return await this.documentCustomerRepository.save(currentDoc);
  }

  async createLoan(data: Loan) {
    console.log('Credit loan', data);
    try {
      const remainPaymentNumber = Math.ceil(
        data.duringMax / data.typeCredit.reimbursement_period,
      );
      const amountTotal =
        data.amount + (data.amount * data.typeCredit.interest) / 100;
      console.log('Credit loan', remainPaymentNumber);
      const loan = this.loanRepository.create({
        ...data,
        remainTotalAmount: amountTotal,
        totalAmount: amountTotal,
        remainTotalPaymentNumber: remainPaymentNumber,
        remainPaymentNumber,
        reimbursement_amount: this.simulationReimbursementAmount(
          amountTotal,
          remainPaymentNumber,
        ),
        status: CREDIT_STATUS.PENDING,
        state: CREDIT_STATE.IN_PROCESSING,
      });
      return await this.loanRepository.save(loan);
    } catch (e) {
      return {
        success: false,
        message: 'Reference already used or error database',
        status: HttpStatus.NOT_ACCEPTABLE,
      };
    }
  }

  simulationReimbursementAmount(amount: number, during: number) {
    return Math.ceil(amount / during);
  }
}
