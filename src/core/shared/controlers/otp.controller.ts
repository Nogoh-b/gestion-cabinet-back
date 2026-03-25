import { Body, Controller, Post } from "@nestjs/common";

import { ApiBody, ApiTags } from "@nestjs/swagger";







import { GenerateCotiOtpDto, SendOtpDto, VerifyOtpDto1 } from "../dto/otp.dto";
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
  @ApiBody({ type: VerifyOtpDto1 })
  verify(@Body() body: VerifyOtpDto1) {
    const { email, code } = body;
    return this.otpService.verifyOtp(email, code);
  }

  @Post('generate/online-link')
  @ApiBody({ type: GenerateCotiOtpDto })
  generateOnlineOtp(@Body() dto: { email: string; savingsAccountCode: string; cotiCode: string }) {
    return this.otpService.generateOtpLink(dto.email, dto.savingsAccountCode, dto.cotiCode);
  }

  @Post('validate/online-link')
  @ApiBody({ type: VerifyOtpDto1 })
  validateOnlineOtp(@Body() dto: { email: string; code: string }) {
    return this.otpService.validateOtpLink(dto.email, dto.code);
  }

  @Post('sendMail')
  @ApiBody({ type: VerifyOtpDto1 })
  sendMail(@Body() dto: { email: string; html: string }) {
    return this.otpService.sendMail(dto.email, dto.html);
  }
}



