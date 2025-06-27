import { Body, Controller, Post } from "@nestjs/common";

import { ApiBody, ApiTags } from "@nestjs/swagger";


import { SendOtpDto, VerifyOtpDto } from "../dto/otp.dto";
import { OtpService } from "../services/otp/otp.service";




@ApiTags('OTP')
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('send')
  @ApiBody({ type: SendOtpDto })
  send(@Body() body: SendOtpDto) {
    const { email, transactionType, amount, provider, savingsAccountCode } = body;
    return this.otpService.generateOtp(email, transactionType, amount, provider, savingsAccountCode);
  }

  @Post('verify')
  @ApiBody({ type: VerifyOtpDto })
  verify(@Body() body: VerifyOtpDto) {
    const { email, code } = body;
    return this.otpService.verifyOtp(email, code);
  }
}
