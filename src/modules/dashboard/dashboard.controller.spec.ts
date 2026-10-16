import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

describe('DashboardController', () => {
  let controller: DashboardController;
  const dashboardService = { getOverview: jest.fn() };

  beforeEach(async () => {
    dashboardService.getOverview.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    })
      // Les gardes (JWT, permissions) ont leurs propres tests.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it("transmet l'utilisateur connecté au service (section financière)", async () => {
    const user = { role: 'avocat', permissions: ['view_dashboard'] };
    dashboardService.getOverview.mockResolvedValue({ financial: null });

    await expect(controller.getOverview(user)).resolves.toEqual({ financial: null });
    expect(dashboardService.getOverview).toHaveBeenCalledWith(user);
  });
});
