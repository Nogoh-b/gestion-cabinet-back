import { Job } from 'bull';
import { Processor, Process } from '@nestjs/bull';




































import { SavingsAccountStatus } from '../savings-account/savings-account/entities/savings-account.entity';
import { SavingsAccountService } from '../savings-account/savings-account/savings-account.service';
import { CreateDebitTransactionSavingsAccountDto } from '../transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
import { Payment, PaymentStatus, PaymentStatusProvider } from '../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingsAccountService } from '../transaction/transaction_saving_account/transaction_saving_account.service';













@Processor('task-queue')
export class QueueProcessor {
  constructor(
    private readonly txService: TransactionSavingsAccountService,
    private readonly accountService: SavingsAccountService,
  ) {}
  @Process('task-name')
  async handleTask(job: Job) {
    console.log('Processing job11 :', job.id);
    // votre logique métier ici
  }


  @Process('check-payment')
  async handleCheckPayment(job: Job) {
    console.log('handleCheckPayment :', job.id);
    const { txId  } = job.data;

    const tx = await this.txService.findOne(txId)
    
    const paymentResult  =/* tx.transactionType.is_credit === 1 ?  */
    await this.txService.mcotiService.checkStatusPaymentDeposit(tx.token, tx.provider.code)
    const dataPayment : Payment = paymentResult.data
    if (dataPayment.paymentStatus != PaymentStatusProvider.PENDING ){
      console.log('payment ',tx.provider.code)
      const isFirstTx = this.txService.isFirstTransaction(tx.targetSavingsAccount)
      const repeatOpts = job.opts.repeat;
      tx.payment_code = dataPayment.id;
      tx.payment_token_provider = dataPayment.payToken
      tx.status_provider = dataPayment.paymentStatus;
      tx.status = PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
      this.txService.update(tx)
      if(tx.status === PaymentStatus.SUCCESSFULL){
        this.txService.validate(tx.id, isFirstTx);
      }
      if (repeatOpts ) {
        await job.queue.removeRepeatable('check-payment', repeatOpts);
        console.log(`Job de check de payment terminé pour ${job.data.txId}`);
      }
      return; // ignore si inactif
    }else if(job.opts.attempts === 3){
      tx.status_provider = PaymentStatusProvider.ISSUE;
      tx.status = PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
      this.txService.update(tx)
    }
      /*:
      await this.txService.mcotiService.checkStatusPaymentWithDraw(tx.token) ;*/
    console.log(dataPayment);
    return dataPayment
  }

  @Process('deduct-fee')
  async handleDeductFee(job: Job<{ accountId: number }>) {
    console.log('Processing job22 :', job.id);

    // const { accountId } = {accountId:2};
    const { accountId  } = job.data;
    // 1) Charger le compte 
    const account = await this.accountService
      .findOne(accountId)
      .catch(() => null);
    if (!account || account.status === SavingsAccountStatus.DEACTIVATE) {
      const repeatOpts = job.opts.repeat;
      if (repeatOpts) {
        await job.queue.removeRepeatable('deduct-fee', repeatOpts);
        // vous pouvez logger pour vérif :
        console.log(`Repeatable job removed for account ${job.data.accountId}`);
      }
      return; // ignore si inactif
    }
    const dto = new CreateDebitTransactionSavingsAccountDto();
    dto.origin_savings_account_code = account.number_savings_account;
    dto.amount = account.type_savings_account.account_opening_fee
    // 2) Déduire la maintenance
    await this.txService.fee_maintenance(dto);
  }
}
