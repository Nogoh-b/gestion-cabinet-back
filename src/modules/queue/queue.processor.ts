import { Job } from 'bull';
import { Processor, Process } from '@nestjs/bull';














import { SavingsAccountStatus } from '../savings-account/savings-account/entities/savings-account.entity';
import { SavingsAccountService } from '../savings-account/savings-account/savings-account.service';
import { CreateDebitTransactionSavingsAccountDto } from '../transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
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
    const { accountId  } = job.data;

    const tx = await this.txService.findOne(accountId)
    console.log(tx.token)
    
    const payment = tx.transactionType.is_credit === 1 ?  
      await this.txService.mcotiService.checkStatusPaymentDeposit(tx.token, tx.provider.code)
      :
      await this.txService.mcotiService.checkStatusPaymentWithDraw(tx.token) ;
    return payment
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
