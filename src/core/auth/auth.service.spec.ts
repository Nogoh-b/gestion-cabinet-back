import * as bcrypt from 'bcrypt';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService - cycle de session', () => {
  const usersService = {
    getPermissionsByRoleCode: jest.fn(),
    updateRefreshToken: jest.fn(),
  };
  const employeeService = {};
  const jwtService = { signAsync: jest.fn() };
  const mailService = {};
  const authTokenService = {};
  const tenantContext = {};
  const mailTemplateService = {};
  const userRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  let service: AuthService;
  let previousRefreshSecret: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    previousRefreshSecret = process.env.JWT_REFRESH_SECRET;
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    manager.getRepository.mockReturnValue(userRepository);
    userRepository.save.mockImplementation(async (user) => user);
    dataSource.transaction.mockImplementation(
      async (_level: string, callback: (tx: typeof manager) => unknown) =>
        callback(manager),
    );
    usersService.getPermissionsByRoleCode.mockResolvedValue([
      { code: 'view_dossiers' },
    ]);
    jwtService.signAsync
      .mockResolvedValueOnce('access-next')
      .mockResolvedValueOnce('refresh-next');
    service = new AuthService(
      usersService as any,
      employeeService as any,
      jwtService as any,
      mailService as any,
      authTokenService as any,
      tenantContext as any,
      mailTemplateService as any,
      dataSource as any,
    );
  });

  afterEach(() => {
    if (previousRefreshSecret === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = previousRefreshSecret;
    }
  });

  it('fait tourner le refresh token sous verrou du compte et ne stocke que son empreinte', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      tenant_id: 2,
      email: 'user@example.test',
      username: 'user',
      role: 'avocat',
      refreshToken: await bcrypt.hash('refresh-current', 4),
      employee: { status: 1 },
      customer: null,
    });

    const tokens = await service.refreshTokens(7, 'refresh-current', 2);

    expect(tokens).toEqual({
      accessToken: 'access-next',
      refreshToken: 'refresh-next',
    });
    expect(userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, tenant_id: 2 },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    const saved = userRepository.save.mock.calls[0][0];
    expect(saved.refreshToken).not.toBe('refresh-next');
    await expect(
      bcrypt.compare('refresh-next', saved.refreshToken),
    ).resolves.toBe(true);
  });

  it('révoque la famille de session lors de la réutilisation d’un ancien token', async () => {
    const user = {
      id: 7,
      tenant_id: 2,
      role: 'avocat',
      refreshToken: await bcrypt.hash('refresh-newer', 4),
      employee: { status: 1 },
      customer: null,
    };
    userRepository.findOne.mockResolvedValue(user);

    await expect(
      service.refreshTokens(7, 'refresh-replayed', 2),
    ).rejects.toEqual(
      new ForbiddenException('Réutilisation de jeton détectée'),
    );
    expect(user.refreshToken).toBeNull();
    expect(userRepository.save).toHaveBeenCalledWith(user);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('révoque le refresh token au logout', async () => {
    await service.logout(7);

    expect(usersService.updateRefreshToken).toHaveBeenCalledWith(7, undefined);
  });
});
