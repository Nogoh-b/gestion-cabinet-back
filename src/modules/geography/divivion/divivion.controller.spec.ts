import { Test, TestingModule } from '@nestjs/testing';
import { DivivionController } from './divivion.controller';
import { DivivionService } from './divivion.service';

describe('DivivionController', () => {
  let controller: DivivionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DivivionController],
      providers: [DivivionService],
    }).compile();

    controller = module.get<DivivionController>(DivivionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
