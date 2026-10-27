// src/core/auth/dto/change-password.dto.ts
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Même règle que ResetPasswordDto / SetPasswordDto. */
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
export const PASSWORD_POLICY_MESSAGE =
  'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  current_password: string;

  @ApiProperty({ example: 'NewPassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(200)
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  new_password: string;
}
