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
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DocumentsLoanDto, GuarantiesLoanDto, LoanDto } from './dto/loan.dto';
import { CREDIT_STATE, CREDIT_STATUS } from '../../../utils/types';
import { LoanService } from './loan.service';
import { ResponseApi } from '../../../utils/interfaces';
import { Loan } from './entities/loan.entity';
import { User } from '../../iam/user/entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../core/common/guards/permissions.guard';

@Controller('loan')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Get('/:customerId/all')
  async findAllLoans(@Param('customerId', ParseIntPipe) customerId: number) {
    // Implementation for finding a loan by ID
    return await this.loanService.findAllLoansByCustomerId(customerId);
  }

  @Get('/:customerId/:loanId')
  async findLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
  ): Promise<ResponseApi<Loan>> {
    // Implementation for finding a loan by ID
    const result = await this.loanService.findOneLoanByCustomerId(
      id,
      customerId,
    );
    if (result.hasOwnProperty('success'))
      throw new ForbiddenException({
        ...result,
      });
    return {
      data: result as Loan,
      status: HttpStatus.OK,
      success: true,
    };
  }

  @Put('valid/:customerId/:loanId')
  async updateLoanStatusToValid(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Req() { user }: { user: User },
  ): Promise<ResponseApi<boolean>> {
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
    return {
      data: loan as boolean,
      success: true,
      status: HttpStatus.OK,
    };
  }

  @Put('/:customerId/:loanId')
  async updateLoanStatusToRevoke(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Req() { user }: { user: User },
  ): Promise<ResponseApi<boolean>> {
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
    return {
      data: await this.loanService.setRevokedLoanByCustomerId(loan, user),
      status: HttpStatus.OK,
      success: true,
    };
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
    return {
      data: await this.loanService.deleteCreditByCustomerId(id),
      status: HttpStatus.OK,
      success: true,
    };
  }

  @Post('docs/:customerId/:loanId')
  @UseInterceptors(FileInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document of guaranty',
    type: GuarantiesLoanDto,
  })
  async uploadGuarantyLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Body() body: GuarantiesLoanDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|gif|pdf)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
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
    return {
      data: await this.loanService.setGuarantiesDocumentsToLoan(loan, []),
      status: HttpStatus.OK,
      success: true,
    };
  }

  @Post('guaranty/:customerId/:loanId')
  @UseInterceptors(FileInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document of guaranty',
    type: DocumentsLoanDto,
  })
  async uploadDocumentLoanById(
    @Param('customerId') customerId: number,
    @Param('loanId') id: number,
    @Body() body: DocumentsLoanDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|gif|pdf)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
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
    const loan = result as Loan;
    return {
      data: await this.loanService.setTypeDocumentsToLoan(loan, []),
      status: HttpStatus.OK,
      success: true,
    };
  }

  @Post('/:customerId')
  async createLoan(
    @Param('customerId') customerId: number,
    @Body() body: LoanDto,
    @Req() { user }: { user: User },
  ) {
    // Implementation for creating a loan
    // check if user as loan in processing
    const result = await this.loanService.getLoanInProcessing(customerId);
    if (!result.hasOwnProperty('success'))
      throw new ForbiddenException({
        success: false,
        message: 'You have a Loan in processing',
        status: HttpStatus.FORBIDDEN,
      });
    return {
      data: await this.loanService.createLoan(body, user),
      success: true,
      status: HttpStatus.OK,
    };
  }
}
