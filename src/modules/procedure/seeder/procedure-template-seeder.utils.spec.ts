import { isBackwardProcedureTransition } from './procedure-template-seeder.utils';

describe('procedure template seeder utilities', () => {
  it('réserve les retours arrière aux cycles bornés', () => {
    expect(isBackwardProcedureTransition(3, 1)).toBe(true);
    expect(isBackwardProcedureTransition(2, 2)).toBe(true);
    expect(isBackwardProcedureTransition(1, 2)).toBe(false);
  });
});
