import { Job } from 'bull';
import { plainToInstance } from 'class-transformer';



import { Processor, Process } from '@nestjs/bull';





import { SavingsAccount, SavingsAccountStatus } from '../savings-account/savings-account/entities/savings-account.entity';
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
    console.log('handleCheckPayment :', job.id ,' ',job.attemptsMade + 1);
    const { txId  } = job.data;

    let tx = await this.txService.findOne(txId)
    const sa = await  this.accountService.findOneByCode(
      tx.targetSavingsAccount?.number_savings_account ?? '',
    );
    const paymentResult  =/* tx.transactionType.is_credit === 1 ?  */
    await this.txService.mcotiService.checkStatusPaymentDeposit(tx.token, tx.provider.code)
    const dataPayment : Payment = paymentResult.data
    // console.log('payment ',sa)
    if (dataPayment && dataPayment.paymentStatus != PaymentStatusProvider.PENDING ){
      // console.log('payment ',tx.provider.code)
      const isFirstTx = await this.txService.isFirstTransaction(plainToInstance(SavingsAccount,sa))
      const repeatOpts = job.opts.repeat;
      const old_status = tx.status;
      tx.payment_code = dataPayment.id;
      tx.payment_token_provider = dataPayment.payToken
      tx.status_provider = dataPayment.paymentStatus;
      tx.commission = dataPayment.amountHT -tx.amount
      tx.status = PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
      this.txService.update(tx)
      if(tx.status === PaymentStatus.SUCCESSFULL && old_status === PaymentStatus.PENDING ){
        console.log('payment suscessfulllll ', isFirstTx, '-----', tx.id , ' ', tx.status_provider)
        tx =  await this.txService.validate(tx.id, isFirstTx);
        if (repeatOpts ) await job.queue.removeRepeatable('check-payment', repeatOpts);

      }
      if (repeatOpts ) {
         await job.queue.removeRepeatable('check-payment', repeatOpts);
        console.log(`Job de check de payment terminé pour ${job.data.txId}`);
      }
      return {dataPayment, tx}; // ignore si inactif
    }else if(job.attemptsMade + 1 === 3){
      console.log('job.attemptsMade + 1 === 3')
      const isFirstTx = await  this.txService.isFirstTransaction(tx.targetSavingsAccount)
      const repeatOpts = job.opts.repeat;
      tx.payment_code = dataPayment.id;
      tx.payment_token_provider = dataPayment.payToken
      tx.status_provider = PaymentStatusProvider.ISSUE;
      tx.status = PaymentStatus[PaymentStatusProvider[dataPayment.paymentStatus]];
      this.txService.update(tx)
      
    }
      /*:
      await this.txService.mcotiService.checkStatusPaymentWithDraw(tx.token) ;*/
    console.log(dataPayment);
    return {dataPayment, tx}
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
