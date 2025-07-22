import { Test, TestingModule } from '@nestjs/testing';
import { RessourceTypeController } from './ressource-type.controller';
import { RessourceTypeService } from './ressource-type.service';

describe('RessourceTypeController', () => {
  let controller: RessourceTypeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RessourceTypeController],
      providers: [RessourceTypeService],
    }).compile();

    controller = module.get<RessourceTypeController>(RessourceTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
