import { Body, Controller, Post } from "@nestjs/common";

import { ApiBody, ApiTags } from "@nestjs/swagger";





import { GenerateCotiOtpDto, SendOtpDto, VerifyOtpDto } from "../dto/otp.dto";
import { OtpService } from "../services/otp/otp.service";







@ApiTags('OTP')
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('send')
  @ApiBody({ type: SendOtpDto })
  send(@Body() body: SendOtpDto) {
    const { email, transactionType, amount, provider, savingsAccountCode,targetSavingsAccountCode } = body;
    return this.otpService.generateOtp(email, transactionType, amount, provider, savingsAccountCode, targetSavingsAccountCode);
  }

  @Post('verify')
  @ApiBody({ type: VerifyOtpDto })
  verify(@Body() body: VerifyOtpDto) {
    const { email, code } = body;
    return this.otpService.verifyOtp(email, code);
  }

  @Post('generate/online-link')
  @ApiBody({ type: GenerateCotiOtpDto })
  generateOnlineOtp(@Body() dto: { email: string; savingsAccountCode: string; cotiCode: string }) {
    return this.otpService.generateOtpLink(dto.email, dto.savingsAccountCode, dto.cotiCode);
  }

  @Post('validate/online-link')
  @ApiBody({ type: VerifyOtpDto })
  validateOnlineOtp(@Body() dto: { email: string; code: string }) {
    return this.otpService.validateOtpLink(dto.email, dto.code);
  }
}



