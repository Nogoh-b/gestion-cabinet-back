import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { In, Repository } from 'typeorm';
import {
  CREDIT_STATE,
  CREDIT_STATUS,
  MODE_REIMBURSEMENT_PERIOD,
} from '../../../utils/types';
import { DocumentsLoanDto, GuarantiesLoanDto, LoanDto } from './dto/loan.dto';
import { User } from '../../iam/user/entities/user.entity';
import { DocumentType } from '../../documents/document-type/entities/document-type.entity';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { TypeCredit } from '../type_credit/entities/typeCredit.entity';
import { dayTime } from '../../../utils/constantes';
import { FilesUtil } from '../../../core/shared/utils/file.util';
import { UPLOAD_DOCS_PATH } from '../../../core/common/constants/constants';
import { DocumentCustomerStatus } from '../../documents/document-customer/entities/document-customer.entity';
import { join } from 'path';
import * as sharp from 'sharp';
import { createWriteStream } from 'fs';
import { GuarantyEstimationService } from '../guaranty/garanty_estimation/guaranty_estimation.service';

@Injectable()
export class LoanService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(DocumentType)
    private readonly documentRepository: Repository<DocumentType>,
    private readonly guarantyEstimationService: GuarantyEstimationService,
  ) {}

  async findAllLoansByCustomerId(customerId: number) {
    return await this.loanRepository.findBy({
      customer: { id: customerId },
    });
    //.map((loan) => ({ ...loan, customer: { id: customerId } }));
  }

  async findOneLoanByCustomerId(id: number, customerId: number) {
    const credit = await this.loanRepository.findOneBy({
      id,
      customer: { id: customerId },
    });
    if (!credit)
      return {
        success: false,
        message: 'No Loans Found',
        status: HttpStatus.NOT_FOUND,
      };
    return credit;
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

  async setApprovedLoanByCustomerId(loan: Loan, user: User) {
    const docs = loan.typeDocument
      .map((next) => next.status === 1)
      .filter((t) => !t);
    // check if all docs are ok
    if (docs.length)
      return {
        success: false,
        message: 'Please active all documents',
        status: HttpStatus.FORBIDDEN,
      };
    // check if all guaranties are ok
    const guaranties = loan.guaranties
      .map((guaranty) => guaranty.status === CREDIT_STATUS.APPROVED)
      .filter((t) => !t);
    if (guaranties.length)
      return {
        success: false,
        message: 'Please active all guaranties',
        status: HttpStatus.FORBIDDEN,
      };
    return await this.updateLoanByCustomerId(
      loan,
      {
        status: CREDIT_STATUS.APPROVED,
        approvedBy: user,
      },
      true,
    );
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
    await this.loanRepository.save(loan, { listeners: listen });
    return true;
  }

  async deleteCreditByCustomerId(loan: Loan) {
    if (loan.approvedBy)
      return {
        success: false,
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot delete this loan',
      };
    await this.loanRepository.delete(loan.id);
    return true;
  }

  async getLoanInProcessing(id: number) {
    const loan = await this.loanRepository.findOneBy({
      customer: { id },
      state: In([CREDIT_STATE.IN_PROCESSING, CREDIT_STATE.ACTIVE]),
      status: In([CREDIT_STATUS.APPROVED, CREDIT_STATUS.PENDING]),
    });
    if (!loan)
      return {
        success: false,
        message: 'No Loans Found',
        status: HttpStatus.NOT_FOUND,
      };
    return loan;
  }

  async setGuarantiesDocumentsToLoan(loan: Loan, guaranty: GuarantiesLoanDto) {
    // create guaranties list
    const { documentId, typeGuaranty, ...result } = guaranty;
    return await this.guarantyEstimationService.addGuarantyEstimation({
      ...result,
      typeGuaranty: { id: typeGuaranty },
      documents: { id: documentId },
      loan,
    } as GuarantyEstimation);
  }

  async setTypeDocumentsToLoan(loan: Loan) {
    // create document list
    return await this.loanRepository.save(loan);
  }

  async createLoan(data: Loan, typeCredit: TypeCredit, user: User) {
    const remainPaymentNumber = Math.ceil(
      data.duringMax / dayTime[typeCredit.reimbursement_period],
    );
    const loan = this.loanRepository.create({
      ...data,
      typeCredit,
      manageBy: user,
      remainPaymentNumber,
      reimbursement_amount: this.simulationReimbursementAmount(
        data.amount,
        remainPaymentNumber,
      ),
      status: CREDIT_STATUS.PENDING,
      state: CREDIT_STATE.IN_PROCESSING,
    });
    return await this.loanRepository.save(loan);
  }

  simulationReimbursementAmount(amount: number, during: number) {
    return Math.ceil(amount / during);
  }
}
