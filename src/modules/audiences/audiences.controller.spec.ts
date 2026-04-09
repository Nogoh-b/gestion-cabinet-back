import { Test, TestingModule } from '@nestjs/testing';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';

describe('AudiencesController', () => {
  let controller: AudiencesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AudiencesController],
      providers: [AudiencesService],
    }).compile();

    controller = module.get<AudiencesController>(AudiencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
