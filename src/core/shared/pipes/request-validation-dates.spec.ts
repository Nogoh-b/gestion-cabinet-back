import { RequestValidationPipe } from './request-validation.pipe';
import { CreateDossierReferralDto } from 'src/modules/referral/dto/create-dossier-referral.dto';
import { CloseDossierDto } from 'src/modules/dossiers/dto/close-dossier.dto';
import { DossierOutcome } from 'src/modules/dossiers/entities/dossier.entity';

/**
 * La conversion implicite du pipe global ne doit pas transformer une date
 * « AAAA-MM-JJ » en objet Date, que @IsDateString refuserait ensuite.
 */
describe('RequestValidationPipe — dates', () => {
  const pipe = new RequestValidationPipe();

  it('accepte la date d’apport envoyée par le formulaire d’ouverture (sans conditions de commission)', async () => {
    const dto = await pipe.transform(
      { dossier_id: 20, referrer_id: 3, referral_date: '2026-11-08' },
      { type: 'body', metatype: CreateDossierReferralDto },
    );
    expect(dto.referral_date).toBe('2026-11-08');
  });

  it('accepte la date de résultat à la clôture', async () => {
    const dto = await pipe.transform(
      { outcome: Object.values(DossierOutcome)[0], outcome_date: '2026-11-08', outcome_notes: 'Jugement favorable' },
      { type: 'body', metatype: CloseDossierDto },
    );
    expect(dto.outcome_date).toBe('2026-11-08');
  });
});
