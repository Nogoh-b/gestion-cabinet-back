import { OtpCode } from 'src/core/entities/otp-code.entity';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';








import { EmailService } from '../email/email.service';










@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    private readonly emailService: EmailService,
  ) {}

  async generateOtp(
    email: string,
    transactionType: number,
    amount: number,
    provider: string,
    savingsAccountCode: string,
  ) {
    let code: string;
    let existing: OtpCode | null;

    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      existing = await this.otpRepository.findOne({
        where: { email, code, used: false },
      });
    } while (existing !== null);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otp = this.otpRepository.create({
      email,
      code,
      expiresAt,
      transactionType,
      amount,
      provider,
      savingsAccountCode,
    });

    await this.otpRepository.save(otp);

    console.log(code)
    const email_sended = this.emailService.sendMail({
      to: email,
      subject: 'Envoi de votre code OTP',
      message: `Code OTP : ${code}\nMontant : ${amount}\nProvider : ${provider}\nType : ${transactionType === 0 ? 'Dépôt' : 'Retrait'}`,
      context: {
        name: '',
        message: `Code OTP : ${code}\nMontant : ${amount}\nProvider : ${provider}\nType : ${transactionType === 0 ? 'Dépôt' : 'Retrait'}`,
      },
    });

    return  { message: 'OTP envoyé' , email_sended };
  }

  async verifyOtp(email: string, code: string) {
    const record = await this.otpRepository.findOne({
      where: { email, code, used: false },
    });

    if (!record) return { success: false, message: 'OTP invalide ou expiré.' };
    if (record.expiresAt < new Date())
      return { success: false, message: 'OTP expiré.' };

    record.used = true;
    await this.otpRepository.save(record);

    return { amount: record.amount, provider: record.provider,  message: 'OTP validé.' };
  }
}
