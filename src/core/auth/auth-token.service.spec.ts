import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuthTokenService } from './auth-token.service';
import { AuthToken } from './entities/auth-token.entity';

describe('AuthTokenService', () => {
  function service(
    repositoryOverrides: Record<string, jest.Mock> = {},
    dataSourceOverrides: Record<string, jest.Mock> = {},
  ) {
    const repository: any = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
      ...repositoryOverrides,
    };
    const dataSource: any = {
      transaction: jest.fn(),
      ...dataSourceOverrides,
    };
    return {
      repository,
      instance: new AuthTokenService(
        repository as Repository<AuthToken>,
        dataSource as DataSource,
      ),
    };
  }

  it('ne stocke jamais le code OTP en clair', async () => {
    const { instance, repository } = service();
    const result = await instance.createOTP('User@Example.com', 'mfa');
    const persisted = repository.save.mock.calls[0][0];

    expect(persisted.email).toBe('user@example.com');
    expect(persisted.otp).not.toBe(result.otp);
    await expect(bcrypt.compare(result.otp, persisted.otp)).resolves.toBe(true);
  });

  it('bloque la sixième demande dans la même heure', async () => {
    const { instance } = service({
      count: jest.fn().mockResolvedValue(5),
    });

    await expect(instance.createOTP('user@example.com', 'mfa')).rejects.toEqual(
      expect.objectContaining({ status: 429 }),
    );
  });

  it('consomme atomiquement un OTP valide sans créer de jeton MFA annexe', async () => {
    const record: any = {
      id: 'otp-1',
      email: 'user@example.com',
      otp: await bcrypt.hash('123456', 4),
      type: 'mfa',
      isUsed: false,
      expiresAt: new Date(Date.now() + 60_000),
      failedAttempts: 0,
      lastAttemptAt: null,
      createdAt: new Date(),
    };
    const transaction = jest.fn(async (_level, callback) =>
      callback({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue(record),
          save: jest.fn(async (value) => value),
        }),
      }),
    );
    const { instance } = service({}, { transaction });

    await expect(
      instance.verifyOTP('user@example.com', '123456', 'mfa', false),
    ).resolves.toEqual({ isValid: true });
    expect(record.isUsed).toBe(true);
  });
});
