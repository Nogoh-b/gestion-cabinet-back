import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesUserService } from './activities-user.service';

describe('ActivitiesUserService', () => {
  let service: ActivitiesUserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivitiesUserService],
    }).compile();

    service = module.get<ActivitiesUserService>(ActivitiesUserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
