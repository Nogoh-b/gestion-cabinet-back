import { describe, expect, it } from '@jest/globals';
import { instanceToPlain, plainToInstance } from 'class-transformer';

import { FactureResponseDto } from './facture-response.dto';

describe('FactureResponseDto', () => {
  it('expose les identifiants, la devise et les lignes nécessaires à l’édition', () => {
    const dto = plainToInstance(
      FactureResponseDto,
      {
        id: 'facture-1',
        dossier_id: 89,
        client_id: 12,
        currency: 'XAF',
        type: 0,
        lines: [
          {
            id: 'line-1',
            label: 'Consultation',
            quantity: '1.00',
            unit_price: '3228.00',
            net_amount: '3228.00',
            tax_rate: '0.00',
            tax_amount: '0.00',
            gross_amount: '3228.00',
            currency: 'XAF',
            billable_item_id: 'item-1',
            category: 'HONORARIUM',
            tenant_id: 1,
          },
        ],
      },
      { excludeExtraneousValues: true },
    );

    expect(instanceToPlain(dto)).toMatchObject({
      id: 'facture-1',
      dossier_id: 89,
      client_id: 12,
      currency: 'XAF',
      lines: [
        {
          id: 'line-1',
          label: 'Consultation',
          gross_amount: '3228.00',
          currency: 'XAF',
          billable_item_id: 'item-1',
          category: 'HONORARIUM',
        },
      ],
    });
    expect(
      (instanceToPlain(dto).lines as Record<string, unknown>[])[0],
    ).not.toHaveProperty('tenant_id');
  });
});
