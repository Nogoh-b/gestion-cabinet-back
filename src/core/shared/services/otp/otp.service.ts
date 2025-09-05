import { OtpCode, OtpOnlineLink } from 'src/core/entities/otp-code.entity';
import { Repository } from 'typeorm';
import { forwardRef, Injectable } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';











import { EmailService } from '../email/email.service';














@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    @InjectRepository(OtpOnlineLink)
    private readonly otpOnlineLinkRepo: Repository<OtpOnlineLink>,
    private readonly emailService: EmailService,
   /* @Inject(forwardRef(() => SavingsAccountService))
    private readonly savingsAccountService: SavingsAccountService*/
  ) {console.log(forwardRef)}

  async generateOtp(
    email: string,
    transactionType: number,
    amount: number,
    provider: string,
    savingsAccountCode: string,
    targetSavingsAccountCode: string,
  ) {
    let code: string;
    let existing: OtpCode | null;

    do {
      code = Math.floor(10000 + Math.random() * 90000).toString();
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
      targetSavingsAccountCode,
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

    return { amount: record.amount, provider: record.provider, targetSavingsAccountCode: record.targetSavingsAccountCode,  message: 'OTP validé.' };
  }


  async generateOtpLink(email: string, savingsAccountCode: string, cotiCode: string = '0') {
  const code = Math.floor(10000 + Math.random() * 90000).toString(); // de 10000 à 99999

  const otp = this.otpOnlineLinkRepo.create({
    email,
    code,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    used: false,
    savingsAccountCode,
    cotiCustomerCode: cotiCode
  });

  await this.otpOnlineLinkRepo.save(otp);

    const email_sended = this.emailService.sendMail({
      to: email,
      subject: 'Envoi de votre code OTP',
      message: `Code OTP : ${code}\nMontant `,
      context: {
        name: '',
        message: `Code OTP : ${code}`,
      },
    });

    return  { message: 'OTP envoyé' , email_sended };
  }

  async validateOtpLink(email: string, code: string): Promise<any> {
    const otp = await this.otpOnlineLinkRepo.findOne({ where: { email, code, used: false } });

    if (!otp || otp.expiresAt < new Date()) return { success: false, message: 'OTP invalide ou expiré.' };

    otp.used = true;
    await this.otpOnlineLinkRepo.save(otp ?? new OtpCode());
    // const sa = await this.savingsAccountService.findOneByCode(otp.savingsAccountCode)

    return {number_saving_account : otp?.savingsAccountCode};
  }

}
