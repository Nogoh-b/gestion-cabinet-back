import { Test, TestingModule } from '@nestjs/testing';
import { UserRoleAssignmentController } from './user-role-assignment.controller';
import { UserRoleAssignmentService } from './user-role-assignment.service';

describe('UserRoleAssignmentController', () => {
  let controller: UserRoleAssignmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserRoleAssignmentController],
      providers: [UserRoleAssignmentService],
    }).compile();

    controller = module.get<UserRoleAssignmentController>(UserRoleAssignmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
