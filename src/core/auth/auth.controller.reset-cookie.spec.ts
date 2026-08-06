import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PASSWORD_RESET_COOKIE } from './session-cookie.util';

describe('AuthController password reset cookie contract', () => {
  const response = () =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as any;

  it('places the reset token in an HttpOnly cookie and removes it from the body', async () => {
    const authService = {
      verifyOTP: jest.fn().mockResolvedValue({
        success: true,
        token: 'server-only-reset-token',
        message: 'Code vérifié',
      }),
    };
    const controller = new AuthController(authService as any);
    const res = response();

    const result = await controller.verifyOTP(
      {
        email: 'user@example.com',
        otp: '123456',
        type: 'reset_password',
      },
      res,
    );

    expect(result).toEqual({
      success: true,
      message: 'Code vérifié',
    });
    expect(result).not.toHaveProperty('token');
    expect(res.cookie).toHaveBeenCalledWith(
      PASSWORD_RESET_COOKIE,
      'server-only-reset-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/auth',
      }),
    );
  });

  it('reads the reset token from the cookie and clears it after success', async () => {
    const authService = {
      resetPassword: jest.fn().mockResolvedValue({
        success: true,
        message: 'Mot de passe réinitialisé',
      }),
    };
    const controller = new AuthController(authService as any);
    const res = response();

    await controller.resetPassword(
      {
        headers: {
          cookie: `${PASSWORD_RESET_COOKIE}=server-only-reset-token`,
        },
      } as any,
      {
        password: 'StrongPassword1!',
        confirmPassword: 'StrongPassword1!',
      },
      res,
    );

    expect(authService.resetPassword).toHaveBeenCalledWith({
      password: 'StrongPassword1!',
      confirmPassword: 'StrongPassword1!',
      token: 'server-only-reset-token',
    });
    expect(res.clearCookie).toHaveBeenCalledWith(
      PASSWORD_RESET_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/auth',
      }),
    );
  });

  it('rejects a reset request without cookie or compatibility token', async () => {
    const controller = new AuthController({} as any);

    await expect(
      controller.resetPassword(
        { headers: {} } as any,
        {
          password: 'StrongPassword1!',
          confirmPassword: 'StrongPassword1!',
        },
        response(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
