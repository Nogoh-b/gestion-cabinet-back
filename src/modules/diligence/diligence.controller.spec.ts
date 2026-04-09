import { Test, TestingModule } from '@nestjs/testing';
import { DiligenceController } from './diligence.controller';
import { DiligenceService } from './diligence.service';

describe('DiligenceController', () => {
  let controller: DiligenceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiligenceController],
      providers: [DiligenceService],
    }).compile();

    controller = module.get<DiligenceController>(DiligenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
