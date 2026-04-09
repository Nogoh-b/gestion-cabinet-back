import { Test, TestingModule } from '@nestjs/testing';
import { AudienceTypeController } from './audience-type.controller';
import { AudienceTypeService } from './audience-type.service';

describe('AudienceTypeController', () => {
  let controller: AudienceTypeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AudienceTypeController],
      providers: [AudienceTypeService],
    }).compile();

    controller = module.get<AudienceTypeController>(AudienceTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
