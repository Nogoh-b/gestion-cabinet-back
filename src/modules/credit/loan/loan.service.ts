import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { In, Repository } from 'typeorm';
import { CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';
import { DocumentsLoanDto, LoanDto } from './dto/loan.dto';
import { User } from '../../iam/user/entities/user.entity';
import { DocumentType } from '../../documents/document-type/entities/document-type.entity';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';

@Injectable()
export class LoanService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
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

  async deleteCreditByCustomerId(id: number) {
    await this.loanRepository.softDelete(id);
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

  async setGuarantiesDocumentsToLoan(
    loan: Loan,
    guaranties: GuarantyEstimation[],
  ) {
    // create guaranties list

    return true;
  }

  async setTypeDocumentsToLoan(loan: Loan, typeDocument: DocumentType[]) {
    // create document list

    return true;
  }

  async createLoan(data: LoanDto, user: User) {
    const loan = this.loanRepository.create({
      ...data,
      manageBy: user,
      status: CREDIT_STATUS.PENDING,
      state: CREDIT_STATE.IN_PROCESSING,
    });
    return await this.loanRepository.save(loan);
  }
}
