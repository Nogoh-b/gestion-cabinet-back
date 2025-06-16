import { Job } from 'bull';
import { SavingsAccountStatus } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { CreateDebitTransactionSavingsAccountDto } from 'src/modules/transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';
import { Processor, Process } from '@nestjs/bull';




@Processor('maintenance')
export class MaintenanceProcessor {
  constructor(
    private readonly txService: TransactionSavingsAccountService,
    private readonly accountService: SavingsAccountService,
  ) {}

  /** 
   * Ce handler sera lancé à chaque exécution programmée
   * data.accountId contient l’ID du compte à débiter
   */
  @Process('deduct-fee')
  async handleDeductFee(job: Job<{ accountId: number }>) {
    const { accountId } = job.data;
    // 1) Charger le compte
    const account = await this.accountService.findOne(accountId);
    if (!account || account.status === SavingsAccountStatus.DEACTIVATE) {
        const repeatOpts = job.opts.repeat;
        if (repeatOpts) {
            await job.queue.removeRepeatable('deduct-fee', repeatOpts);
            // vous pouvez logger pour vérif :
            console.log(`Repeatable job removed for account ${job.data.accountId}`);
        }
        return; // ignore si inactif
    }
    const dto = new CreateDebitTransactionSavingsAccountDto()   
    dto.origin_savings_account_code = account.number_savings_account
    // 2) Déduire la maintenance
    await this.txService.fee_maintenance(dto);


  }
}
