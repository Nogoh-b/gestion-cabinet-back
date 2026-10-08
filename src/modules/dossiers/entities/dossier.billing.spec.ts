import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from '@jest/globals';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';

import { DossierResponseDto } from '../dto/dossier-response.dto';
import { Dossier } from './dossier.entity';

const facture = (status: StatutFacture, montantTTC: number): Facture =>
  ({ status, montantTTC }) as Facture;

describe('Dossier - calculs de facturation', () => {
  it('exclut les factures annulées du total facturé', () => {
    const dossier = new Dossier();
    dossier.factures = [
      facture(StatutFacture.ENVOYEE, 100_000),
      facture(StatutFacture.ANNULEE, 40_000),
    ];

    expect(dossier.total_factures_amount).toBe(100_000);
  });

  it('exclut les factures annulées du coût réel recalculé', () => {
    const dossier = new Dossier();
    dossier.factures = [
      facture(StatutFacture.PAYEE, 75_000),
      facture(StatutFacture.ANNULEE, 25_000),
    ];

    dossier.computeActualCosts();

    expect(dossier.actual_costs).toBe(75_000);
  });

  it('exclut les factures annulées du DTO utilisé par la page Facturation', () => {
    const dto = plainToInstance(DossierResponseDto, {
      factures: [
        facture(StatutFacture.IMPAYEE, 90_000),
        facture(StatutFacture.ANNULEE, 30_000),
      ],
    });

    expect(dto.total_factures_amount).toBe(90_000);
  });
});
