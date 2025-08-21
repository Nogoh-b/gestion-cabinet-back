import { Test, TestingModule } from '@nestjs/testing';
import { UserRoleAssignmentService } from './user-role-assignment.service';

describe('UserRoleAssignmentService', () => {
  let service: UserRoleAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserRoleAssignmentService],
    }).compile();

    service = module.get<UserRoleAssignmentService>(UserRoleAssignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
