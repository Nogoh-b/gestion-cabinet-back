import { Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import {
  DossierReferral,
  CommissionBasis,
} from './entities/dossier-referral.entity';
import {
  ReferralCommission,
  CommissionStatus,
} from './entities/referral-commission.entity';

@Injectable()
export class ReferralCommissionListener {
  private readonly logger = new Logger(ReferralCommissionListener.name);

  constructor(
    @InjectRepository(DossierReferral)
    private readonly dossierReferralRepo: Repository<DossierReferral>,
    @InjectRepository(ReferralCommission)
    private readonly commissionRepo: Repository<ReferralCommission>,
  ) {}

  @OnEvent('facture.envoyee')
  async handleFactureEnvoyee(payload: any): Promise<void> {
    try {
      this.logger.log(
        `[facture.envoyee] Recu | facture=${payload?.id ?? 'NA'} | dossier=${payload?.dossier_id ?? 'NA'} | ht=${payload?.montantHT ?? 'NA'} | ttc=${payload?.montantTTC ?? 'NA'}`,
      );

      const factureId = payload?.id;
      const dossierId = payload?.dossier_id;

      if (!factureId || !dossierId) {
        this.logger.warn(
          `[facture.envoyee] Ignore: payload incomplet | factureId=${factureId ?? 'NA'} | dossierId=${dossierId ?? 'NA'}`,
        );
        return;
      }

      this.logger.debug(`[facture.envoyee] Recherche apport dossier | dossier_id=${dossierId}`);
      const referral = await this.dossierReferralRepo.findOne({
        where: { dossier_id: dossierId },
      });
      if (!referral) {
        this.logger.warn(`[facture.envoyee] Ignore: aucun apporteur lie au dossier | dossier_id=${dossierId}`);
        return;
      }

      this.logger.debug(
        `[facture.envoyee] Apport trouve | referral=${referral.id} | basis=${referral.commission_basis} | rate=${referral.commission_rate} | tenant=${referral.tenant_id}`,
      );

      if (
        referral.commission_basis !== CommissionBasis.INVOICED_HT &&
        referral.commission_basis !== CommissionBasis.INVOICED_TTC
      ) {
        this.logger.warn(
          `[facture.envoyee] Ignore: base commission non facturable | referral=${referral.id} | basis=${referral.commission_basis}`,
        );
        return;
      }

      const existing = await this.commissionRepo.findOne({
        where: {
          dossier_referral_id: referral.id,
          facture_id: factureId,
        },
      });
      if (existing) {
        this.logger.warn(
          `[facture.envoyee] Ignore: commission deja existante | commission=${existing.id} | facture_id=${factureId}`,
        );
        return;
      }

      const base =
        referral.commission_basis === CommissionBasis.INVOICED_HT
          ? Number(payload?.montantHT ?? 0)
          : Number(payload?.montantTTC ?? 0);

      if (base <= 0) {
        this.logger.warn(
          `[facture.envoyee] Ignore: base invalide | facture_id=${factureId} | base=${base}`,
        );
        return;
      }

      const rate = Number(referral.commission_rate ?? 0);
      if (rate <= 0) {
        this.logger.warn(`[facture.envoyee] Ignore: taux commission invalide | referral=${referral.id} | rate=${rate}`);
        return;
      }

      const amount = Math.round(base * rate) / 100;
      this.logger.log(
        `[facture.envoyee] Commission calculee | base=${base} | rate=${rate} | amount=${amount}`,
      );

      const commission = this.commissionRepo.create({
        dossier_referral: referral,
        dossier_referral_id: referral.id,
        facture_id: factureId,
        paiement_id: undefined,
        amount,
        status: CommissionStatus.CALCULATED,
        calculation_date: new Date(),
        tenant_id: referral.tenant_id,
      });

      await this.commissionRepo.save(commission);

      this.logger.log(
        `[facture.envoyee] Commission auto-calculee OK | commission=${commission.id} | amount=${amount} | referral=${referral.id} | facture=${factureId}`,
      );
    } catch (err) {
      this.logger.error('[facture.envoyee] Echec du calcul automatique de commission', err as any);
    }
  }

  @OnEvent('paiement.valide')
  async handlePaiementValide(payload: any): Promise<void> {
    try {
      this.logger.log(
        `[paiement.valide] Recu | paiement=${payload?.id ?? 'NA'} | facture=${payload?.facture?.id ?? 'NA'} | dossier=${payload?.facture?.dossier_id ?? 'NA'} | montant=${payload?.montant ?? 'NA'}`,
      );

      const facture = payload?.facture;
      const dossierId = facture?.dossier_id;
      const paiementId = payload?.id;
      const montantPaye = Number(payload?.montant ?? 0);

      if (!dossierId || !paiementId || montantPaye <= 0) {
        this.logger.warn(
          `[paiement.valide] Ignore: payload incomplet ou montant invalide | dossierId=${dossierId ?? 'NA'} | paiementId=${paiementId ?? 'NA'} | montantPaye=${montantPaye}`,
        );
        return;
      }

      this.logger.debug(`[paiement.valide] Recherche apport dossier | dossier_id=${dossierId}`);
      const referral = await this.dossierReferralRepo.findOne({
        where: { dossier_id: dossierId },
      });
      if (!referral) {
        this.logger.warn(`[paiement.valide] Ignore: aucun apporteur lie au dossier | dossier_id=${dossierId}`);
        return;
      }

      this.logger.debug(
        `[paiement.valide] Apport trouve | referral=${referral.id} | basis=${referral.commission_basis} | rate=${referral.commission_rate} | tenant=${referral.tenant_id}`,
      );

      if (
        referral.commission_basis !== CommissionBasis.COLLECTED_HT &&
        referral.commission_basis !== CommissionBasis.COLLECTED_TTC
      ) {
        this.logger.warn(
          `[paiement.valide] Ignore: base commission non encaissable | referral=${referral.id} | basis=${referral.commission_basis}`,
        );
        return;
      }

      this.logger.debug(`[paiement.valide] Verification commission existante | paiement_id=${paiementId}`);
      const existing = await this.commissionRepo.findOne({
        where: { paiement_id: paiementId },
      });
      if (existing) {
        this.logger.warn(
          `[paiement.valide] Ignore: commission deja existante | commission=${existing.id} | paiement_id=${paiementId}`,
        );
        return;
      }

      let base = montantPaye;
      if (referral.commission_basis === CommissionBasis.COLLECTED_HT) {
        const tva = Number(facture?.tauxTVA ?? 0);
        base = tva > 0 ? montantPaye / (1 + tva / 100) : montantPaye;
        this.logger.debug(
          `[paiement.valide] Base HT calculee | montant=${montantPaye} | tva=${tva} | base=${base}`,
        );
      } else {
        this.logger.debug(`[paiement.valide] Base TTC utilisee | base=${base}`);
      }

      const rate = Number(referral.commission_rate ?? 0);
      if (rate <= 0) {
        this.logger.warn(`[paiement.valide] Ignore: taux commission invalide | referral=${referral.id} | rate=${rate}`);
        return;
      }

      const amount = Math.round(base * rate) / 100;
      this.logger.log(
        `[paiement.valide] Commission calculee | base=${base} | rate=${rate} | amount=${amount}`,
      );

      const commission = this.commissionRepo.create({
        dossier_referral: referral,
        dossier_referral_id: referral.id,
        facture_id: facture?.id ?? null,
        paiement_id: paiementId,
        amount,
        status: CommissionStatus.CALCULATED,
        calculation_date: new Date(),
        tenant_id: referral.tenant_id,
      });

      this.logger.debug(
        `[paiement.valide] Sauvegarde commission | referral=${referral.id} | facture=${facture?.id ?? 'NULL'} | paiement=${paiementId} | tenant=${referral.tenant_id}`,
      );
      await this.commissionRepo.save(commission);

      this.logger.log(
        `[paiement.valide] Commission auto-calculee OK | commission=${commission.id} | amount=${amount} | referral=${referral.id} | paiement=${paiementId}`,
      );
    } catch (err) {
      this.logger.error('[paiement.valide] Echec du calcul automatique de commission', err as any);
    }
  }
}
