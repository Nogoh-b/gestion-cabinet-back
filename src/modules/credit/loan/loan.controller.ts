import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  NotAcceptableException, NotFoundException,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  DocumentLoanDto,
  GuarantyDocumentLoanDto,
  LoanDto,
} from './dto/loan.dto';
import { CREDIT_CODE, CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';
import { LoanService } from './loan.service';
import { Loan } from './entities/loan.entity';
import { User } from '../../iam/user/entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';
import { TypeCreditService } from '../type_credit/typeCredit.service';
import { TypeCredit } from '../type_credit/entities/typeCredit.entity';
import { CustomersService } from '../../customer/customer/customer.service';
import { dayTime } from '../../../utils/constantes';
import { TransactionSavingsAccountService } from '../../transaction/transaction_saving_account/transaction_saving_account.service';
import { SavingsAccountService } from '../../savings-account/savings-account/savings-account.service';
import { InjectRepository } from '@nestjs/typeorm';
import { SavingsAccount } from '../../savings-account/savings-account/entities/savings-account.entity';
import { Repository } from 'typeorm';

@Controller('loan')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly typeCreditService: TypeCreditService,
    private readonly customersService: CustomersService,
    private readonly transactionService: TransactionSavingsAccountService,
    @InjectRepository(SavingsAccount)
    private readonly savingAccountRepository: Repository<SavingsAccount>,
  ) {}

  @Get('/:customerId/all')
  async findAllLoans(@Param('customerId', ParseIntPipe) customerId: number) {
    // Implementation for finding a loan by ID
    return await this.loanService.findAllLoansByCustomerId(customerId);
  }

  @Get('one/:customerId/:loanId')
  async findLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
  ) {
    // Implementation for finding a loan by ID
    const result = await this.loanService.findOneLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return result as Loan;
  }

  @Get('transactions/:customerId/:loanId')
  async findTransactionsLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
  ) {
    // Implementation for finding a loan by ID
    const result = await this.loanService.findTransactionsLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return true;
  }

  @Put('valid/:customerId/:loanId')
  async updateLoanStatusToValid(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Req() { user }: { user: User },
  ) {
    // Implementation for updating a loan
    const result = await this.loanService.findOneLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = await this.loanService.setApprovedLoanByCustomerId(
      result as Loan,
      user,
    );
    if ((loan as any).hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return true;
  }

  @Put('revoked/:customerId/:loanId')
  async updateLoanStatusToRevoke(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Req() { user }: { user: User },
  ) {
    // Implementation for updating a loan
    const result = await this.loanService.findOneLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = result as Loan;
    return await this.loanService.setRevokedLoanByCustomerId(loan, user);
  }

  @Put('/:customerId/:loanId')
  async updateLoanState(
    @Param('customerId') id: string,
    @Param('loanId') loanId: string,
    @Query('status') state: CREDIT_STATE,
  ) {
    // Implementation for updating a loan
  }

  @Delete('/:customerId/:loanId')
  async deleteLoan(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.findOneLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const isDelete = await this.loanService.deleteLoanByCustomerId(
      result as Loan,
    );
    if ((isDelete as any).hasOwnProperty('success'))
      throw new ForbiddenException({
        ...(isDelete as any),
      });
    return isDelete;
  }

  @Put('doc/valid/:documentId/:customerId')
  async validDocLoan(
    @Param('documentId') documentId: number,
    @Param('customerId') id: number,
  ) {
    // Implementation for valid a doc to loan
    const result = await this.loanService.getLoanInProcessing(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = result as Loan;
    const document = loan.documents.find((doc) => doc.id === documentId);
    if (!document)
      throw new ForbiddenException({
        success: false,
        status: HttpStatus.FORBIDDEN,
        message: 'Document not found.',
      });
    return await this.loanService.validDocByCustomerId(document);
  }

  @Put('doc/reject/:documentId/:customerId')
  async rejectDocLoan(
    @Param('documentId') documentId: number,
    @Param('loanId') id: number,
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.getLoanInProcessing(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = result as Loan;
    const document = loan.documents.find((doc) => doc.id === documentId);
    if (!document)
      throw new ForbiddenException({
        success: false,
        status: HttpStatus.FORBIDDEN,
        message: 'Document not found.',
      });
    return await this.loanService.rejectDocByCustomerId(document);
  }

  @Put('submit/:customerId')
  async submitDocLoan(
    @Param('customerId') id: number,
    @Req() { user }: { user: User },
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.getLoanInProcessing(id);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = result as Loan;
    return await this.loanService.submitLoan(loan, user);
  }

  @Post('guaranty/:customerId/:loanId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: GuarantyDocumentLoanDto,
  })
  async setGuarantyLoanDocumentById(
    @Param('customerId') customerId: number,
    @Body() body: GuarantyDocumentLoanDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|gif|pdf)$/ })
        .addMaxSizeValidator({ maxSize: 1024 * 1024 * 2 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.getLoanInProcessing(customerId);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    console.log('Document of guaranty', body);
    body.file = file;
    const loan = result as Loan;
    console.log(loan.typeCredit);
    // check if loan is in processing
    const is_not_in_processing = loan.status !== CREDIT_STATUS.PENDING;
    if (is_not_in_processing)
      throw new ForbiddenException({
        success: false,
        status: HttpStatus.FORBIDDEN,
        message:
          'Loan has approved or rejected, you cannot send document now. Please contact the administrator.',
      });
    const { typeCredit } = loan;
    if (!typeCredit)
      throw new NotAcceptableException({
        success: false,
        message: "This loan don't associated any type of credit!",
        status: HttpStatus.NOT_ACCEPTABLE,
      });
    if (!typeCredit.typeGuaranties.length)
      throw new ForbiddenException({
        success: false,
        message: "This type of credit don't accept any type of guaranty!",
        status: HttpStatus.FORBIDDEN,
      });
    const typeGuaranty = typeCredit.typeGuaranties.find(
      (t) => t.id === Number(body.typeGuaranty),
    );
    if (!typeGuaranty)
      throw new ForbiddenException({
        success: false,
        message: 'Guaranty type is not match of this loan!',
        status: HttpStatus.FORBIDDEN,
      });
    return await this.loanService.setGuarantiesDocumentsToLoan(
      customerId,
      loan.id,
      typeGuaranty.typeOfDocument.id,
      body,
    );
  }

  @Post('doc/:customerId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: DocumentLoanDto,
  })
  async setDocumentLoanById(
    @Param('customerId') customerId: number,
    @Body() body: DocumentLoanDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|gif|pdf)$/ })
        .addMaxSizeValidator({ maxSize: 1024 * 1024 * 2 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.getLoanInProcessing(customerId);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });

    console.log('Document of guaranty', body);
    body.file = file;
    const loan = result as Loan;
    const is_not_in_processing = loan.status !== CREDIT_STATUS.PENDING;
    if (is_not_in_processing)
      throw new ForbiddenException({
        success: false,
        status: HttpStatus.FORBIDDEN,
        message:
          'Loan has approved or rejected, you cannot send document now. Please contact the administrator.',
      });
    const { typeCredit } = loan;
    if (!typeCredit)
      throw new NotAcceptableException({
        success: false,
        message: "This loan don't associated any type of credit!",
        status: HttpStatus.NOT_ACCEPTABLE,
      });
    if (!typeCredit.typeOfDocuments.length)
      throw new ForbiddenException({
        message: 'This loan not required a document!',
        status: HttpStatus.FORBIDDEN,
        success: false,
      });
    const typedoc = typeCredit.typeOfDocuments.find(
      (t) => t.id === Number(body.typeOfDocument),
    );
    if (!typedoc)
      throw new ForbiddenException({
        success: false,
        message: 'Document type is not match of this loan',
        status: HttpStatus.FORBIDDEN,
      });
    return await this.loanService.setTypeDocumentsToLoan(
      customerId,
      loan.id,
      body,
    );
  }

  @Post('/:customerId/:typeCreditId')
  async createLoan(
    @Param('typeCreditId') typeCreditId: number,
    @Param('customerId') customerId: number,
    @Body() { credit_account_id, ...body }: LoanDto,
    @Req() { user }: { user: any },
  ) {
    // Implementation for creating a loan
    const creditAccount = await this.savingAccountRepository.findOne({
      where: {
        id: credit_account_id,
        customer: { id: customerId },
        type_savings_account: {
          code: CREDIT_CODE,
        },
      },
    });
    if (!creditAccount)
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        success: false,
        message: 'Credit account not found. Please contact the administrator.',
      });
    if (!body.amount)
      throw new ForbiddenException({
        status: HttpStatus.NOT_ACCEPTABLE,
        success: false,
        message: 'Please amount is not null',
      });
    // check if user as loan in processing
    const result = await this.loanService.getLoanInProcessing(customerId);
    if (!result.hasOwnProperty('success'))
      throw new ForbiddenException({
        success: false,
        message: 'You have a Loan in processing',
        status: HttpStatus.FORBIDDEN,
      });
    console.log('Document of guaranty', body);
    const typeCredit =
      await this.typeCreditService.findOneTypeCredits(typeCreditId);
    if (typeCredit.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...typeCredit,
      });
    // const transaction = await this.transactionService
    //   .findOne(body.reference)
    //   .catch((e) => false);
    // if (!(transaction as boolean))
    //   throw new ForbiddenException({
    //     status: HttpStatus.NOT_ACCEPTABLE,
    //     success: false,
    //     message: 'Your transaction is not found',
    //   });
    // const trans = transaction as TransactionSavingsAccount;
    // const tc = typeCredit as TypeCredit;
    // if (trans.amount !== tc.fee)
    //   throw new ForbiddenException({
    //     status: HttpStatus.NOT_ACCEPTABLE,
    //     success: false,
    //     message: 'Please make your payment before to get the loan',
    //   });
    const customer = await this.customersService.findOne(customerId);
    // if (customer.id !== trans.targetSavingsAccount?.customer.id)
    //   throw new ForbiddenException({
    //     status: HttpStatus.NOT_ACCEPTABLE,
    //     success: false,
    //     message: 'This payment not match',
    //   });
    console.log('Document of guaranty', customer);
    // if (customer.cote < (typeCredit as TypeCredit).eligibility_rating)
    //   throw new ForbiddenException({
    //     success: false,
    //     message: "You don't have eligibility rating",
    //     status: HttpStatus.FORBIDDEN,
    //   });
    return await this.loanService.createLoan(
      {
        ...body,
        reference: body.reference,
        customer: { id: customerId },
        manageBy: { id: user.userId as number },
        credit_account: { id: creditAccount.id },
      } as Loan,
      typeCredit as TypeCredit,
    );
  }

  @Get('simulate/:typeCreditId')
  async simulateLoan(
    @Query('amount', ParseIntPipe) amount: number,
    @Query('during', ParseIntPipe) during: number,
    @Param('typeCreditId', ParseIntPipe) typeCreditId: number,
  ) {
    const result =
      await this.typeCreditService.findOneTypeCredits(typeCreditId);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const typeCredit = result as TypeCredit;
    const remainPaymentNumber = Math.ceil(
      during / dayTime[typeCredit.reimbursement_period],
    );
    return this.loanService.simulationReimbursementAmount(
      amount,
      remainPaymentNumber,
    );
  }
}
