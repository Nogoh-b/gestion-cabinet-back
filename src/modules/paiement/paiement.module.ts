import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';







import { FactureModule } from '../facture/facture.module';
import { Paiement } from './entities/paiement.entity';
import { PaiementController } from './paiement.controller';
import { PaiementService } from './paiement.service';








@Module({
  imports: [TypeOrmModule.forFeature([Paiement]), FactureModule],
  controllers: [PaiementController],
  providers: [PaiementService],
  exports: [PaiementService,TypeOrmModule],
})
export class PaiementModule {}
