import { In, Repository } from 'typeorm';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { UPLOAD_DOCS_PATH } from '../../../core/common/constants/constants';
import { FilesUtil } from '../../../core/shared/utils/file.util';
import { CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from '../../documents/document-customer/entities/document-customer.entity';
import { DocumentTypeService } from '../../documents/document-type/document-type.service';
import { User } from '../../iam/user/entities/user.entity';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { GuarantyEstimationService } from '../guaranty/garanty_estimation/guaranty_estimation.service';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';
import { DocumentLoanDto, GuarantyDocumentLoanDto } from './dto/loan.dto';
import { Loan } from './entities/loan.entity';

@Injectable()
export class LoanService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(DocumentCustomer)
    private readonly documentCustomerRepository: Repository<DocumentCustomer>,
    private readonly documentTypeService: DocumentTypeService,
    private readonly guarantyEstimationService: GuarantyEstimationService,
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

  async setApprovedLoanByCustomerId(loan: Loan, user: User) {
    return await this.updateLoanByCustomerId(
      loan,
      {
        state: CREDIT_STATE.ACTIVE,
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
    const current = await this.loanRepository.preload({ id: loan.id, ...data });
    if (!current)
      return {
        success: false,
        message: 'No Loan Found, update failed',
        status: HttpStatus.NOT_FOUND,
      };
    await this.loanRepository.save(current, { listeners: listen });
    return true;
  }

  async deleteLoanByCustomerId(loan: Loan) {
    if (loan.approvedBy)
      return {
        success: false,
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot delete this loan',
      };
    await this.loanRepository.delete(loan.id);
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
        guaranties: true,
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
            (guaranty) => guaranty.status && guaranty.documents.status,
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
      true,
    );
    return true;
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
    const remainPaymentNumber = Math.ceil(
      data.duringMax / data.typeCredit.reimbursement_period,
    );
    const amountTotal = data.amount + (data.amount * data.typeCredit.interest) / 100;
    console.log('Credit loan', remainPaymentNumber);
    const loan = this.loanRepository.create({
      ...data,
      remainTotalAmount: amountTotal,
      remainTotalPaymentNumber: remainPaymentNumber,
      remainPaymentNumber,
      reimbursement_amount: this.simulationReimbursementAmount(
        amountTotal,
        remainPaymentNumber,
      ),
      status: CREDIT_STATUS.PENDING,
      state: CREDIT_STATE.IN_PROCESSING,
    });
    return {
      ...(await this.loanRepository.save(loan)),
      amount_remain: loan.amount,
      amount_total: 0,
    };
  }

  simulationReimbursementAmount(amount: number, during: number) {
    return Math.ceil(amount / during);
  }
}
