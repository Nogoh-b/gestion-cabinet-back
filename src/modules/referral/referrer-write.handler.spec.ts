import { ReferrerType } from './entities/referral.entity';
import { toReferrerType } from './referrer-write.handler';

describe('toReferrerType', () => {
  it('traduit les libellés du chat', () => {
    expect(toReferrerType('expert-comptable')).toBe(ReferrerType.ACCOUNTANT);
    expect(toReferrerType('Fiduciaire')).toBe(ReferrerType.ACCOUNTANT);
    expect(toReferrerType('confrère')).toBe(ReferrerType.LAWYER);
    expect(toReferrerType('accountant')).toBe(ReferrerType.ACCOUNTANT);
  });

  it('retombe sur « Autre » plutôt que de bloquer', () => {
    expect(toReferrerType('inconnu')).toBe(ReferrerType.OTHER);
    expect(toReferrerType(undefined)).toBe(ReferrerType.OTHER);
  });
});
