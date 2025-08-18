import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DocumentsLoanDto, GuarantiesLoanDto, LoanDto } from './dto/loan.dto';
import { CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';
import { LoanService } from './loan.service';
import { ResponseApi } from '../../../utils/interfaces';
import { Loan } from './entities/loan.entity';
import { User } from '../../iam/user/entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';
import { TransactionSavingsAccount } from '../../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { TypeCreditService } from '../type_credit/typeCredit.service';
import { TypeCredit } from '../type_credit/entities/typeCredit.entity';
import { CustomersService } from '../../customer/customer/customer.service';
import { dayTime } from '../../../utils/constantes';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { DocumentCustomerService } from '../../documents/document-customer/document-customer.service';

@Controller('loan')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly typeCreditService: TypeCreditService,
    private readonly customersService: CustomersService,
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
  async setGuarantyLoanDocumentById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Body() body: GuarantiesLoanDto,
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
    const loan = result as Loan;
    return await this.loanService.setGuarantiesDocumentsToLoan(loan, body);
  }

  @Post('doc/:customerId/:loanId')
  async setDocumentLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Body() body: DocumentsLoanDto,
  ) {
    // Implementation for deleting a loan
    const result = await this.loanService.getLoanInProcessing(customerId);
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    const loan = { ...result, documents: [{ id: body.documentId }] } as Loan;
    console.log('Document of guaranty');

    return await this.loanService.setTypeDocumentsToLoan(loan);
  }

  @Post('/:customerId/:typeCreditId')
  async createLoan(
    @Param('typeCreditId') typeCreditId: number,
    @Param('customerId') customerId: number,
    @Body() body: LoanDto,
    @Req() { user }: { user: User },
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
    const customer = await this.customersService.findOne(customerId);
    console.log('Document of guaranty', customer);
    if (customer.cote < (typeCredit as TypeCredit).eligibility_rating)
      throw new ForbiddenException({
        success: false,
        message: "You don't have eligibility rating",
        status: HttpStatus.FORBIDDEN,
      });
    return await this.loanService.createLoan(
      { ...body, customer: { id: customerId } } as Loan,
      typeCredit as TypeCredit,
      user,
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
