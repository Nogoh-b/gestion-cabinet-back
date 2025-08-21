import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesUserController } from './activities-user.controller';
import { ActivitiesUserService } from './activities-user.service';

describe('ActivitiesUserController', () => {
  let controller: ActivitiesUserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivitiesUserController],
      providers: [ActivitiesUserService],
    }).compile();

    controller = module.get<ActivitiesUserController>(ActivitiesUserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
