import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesSavingsAccountService } from './activities-savings-account.service';

describe('ActivitiesSavingsAccountService', () => {
  let service: ActivitiesSavingsAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivitiesSavingsAccountService],
    }).compile();

    service = module.get<ActivitiesSavingsAccountService>(ActivitiesSavingsAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
