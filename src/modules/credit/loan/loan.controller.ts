import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';
import { dayTime } from '../../../utils/constantes';
import { CREDIT_STATE } from '../../../utils/types';
import { CustomersService } from '../../customer/customer/customer.service';
import { User } from '../../iam/user/entities/user.entity';
import { TransactionSavingsAccountService } from '../../transaction/transaction_saving_account/transaction_saving_account.service';
import { TypeCredit } from '../type_credit/entities/typeCredit.entity';
import { TypeCreditService } from '../type_credit/typeCredit.service';
import {
  DocumentLoanDto,
  GuarantyDocumentLoanDto,
  LoanDto,
} from './dto/loan.dto';
import { Loan } from './entities/loan.entity';
import { LoanService } from './loan.service';


@Controller('loan')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly typeCreditService: TypeCreditService,
    private readonly customersService: CustomersService,
    private readonly transactionService: TransactionSavingsAccountService,
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
    const isDelete = await this.loanService.deleteCreditByCustomerId(
      result as Loan,
    );
    if ((isDelete as any).hasOwnProperty('success'))
      throw new ForbiddenException({
        ...(isDelete as any),
      });
    return isDelete;
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
    @Param('loanId') id: number,
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
    const typeCredit =
      await this.typeCreditService.findOneTypeCredits(loan.typeCredit.id);
    if (typeCredit.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...typeCredit,
      });
    const typedoc = (typeCredit as TypeCredit).typeGuaranties.find(
      (t) => t.typeOfDocument.id === id,
    );
    if (!typedoc)
      throw new ForbiddenException({
        success: false,
        message: 'Document type is not match of this guaranty',
        status: HttpStatus.FORBIDDEN,
      });
    if (!loan.typeCredit)
      throw new ForbiddenException({
        message: 'We cannot access to typeCredit of this loan',
        status: HttpStatus.FORBIDDEN,
        success: false,
      });
    else if (loan.typeCredit && !loan.typeCredit.typeGuaranties.length)
      throw new ForbiddenException({
        message: 'This loan not required a guaranty!',
        status: HttpStatus.FORBIDDEN,
        success: false,
      });
    return await this.loanService.setGuarantiesDocumentsToLoan(
      customerId,
      loan,
      body,
    );
  }

  @Post('doc/:customerId/:loanId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload document',
    type: DocumentLoanDto,
  })
  async setDocumentLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
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
    const typeCredit =
      await this.typeCreditService.findOneTypeCredits(loan.typeCredit.id);
    if (typeCredit.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...typeCredit,
      });
    const typedoc = (typeCredit as TypeCredit).typeOfDocuments.find(
      (t) => t.id === id,
    );
    if (!typedoc)
      throw new ForbiddenException({
        success: false,
        message: 'Document type is not match of this loan',
        status: HttpStatus.FORBIDDEN,
      });
    if (!loan.typeCredit)
      throw new ForbiddenException({
        message: 'We cannot access to typeCredit of this loan',
        status: HttpStatus.FORBIDDEN,
        success: false,
      });
    else if (loan.typeCredit && !loan.typeCredit.typeOfDocuments.length)
      throw new ForbiddenException({
        message: 'This loan not required a document!',
        status: HttpStatus.FORBIDDEN,
        success: false,
      });
    return await this.loanService.setTypeDocumentsToLoan(
      customerId,
      loan,
      body,
    );
  }

  @Post('/:customerId/:typeCreditId')
  async createLoan(
    @Param('typeCreditId') typeCreditId: number,
    @Param('customerId') customerId: number,
    @Body() body: LoanDto,
    @Req() { user }: { user: any },
  ) {
    // Implementation for creating a loan
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
        manageBy: { id: user.userId },
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
