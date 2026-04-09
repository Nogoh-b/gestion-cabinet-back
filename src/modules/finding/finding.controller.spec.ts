import { Test, TestingModule } from '@nestjs/testing';
import { FindingController } from './finding.controller';
import { FindingService } from './finding.service';

describe('FindingController', () => {
  let controller: FindingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FindingController],
      providers: [FindingService],
    }).compile();

    controller = module.get<FindingController>(FindingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
