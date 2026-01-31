import { Test, TestingModule } from '@nestjs/testing';
import { JurisdictionController } from './jurisdiction.controller';
import { JurisdictionService } from './jurisdiction.service';

describe('JurisdictionController', () => {
  let controller: JurisdictionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JurisdictionController],
      providers: [JurisdictionService],
    }).compile();

    controller = module.get<JurisdictionController>(JurisdictionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
