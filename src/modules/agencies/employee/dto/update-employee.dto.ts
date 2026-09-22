import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';

/**
 * DTO de mise à jour d'un employé.
 * Tous les champs sont optionnels. `status` accepte soit le code
 * texte du formulaire ("active", "inactive", "on_leave", "training",
 * "sick_leave") soit la valeur numérique BD (1, 0, -1, 2).
 */
export class UpdateEmployeeDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    required: false,
    example: 'active',
    description: 'Statut : "active" | "inactive" | "on_leave" | "training" | "sick_leave" ou 1 | 0 | -1 | 2',
  })
  @IsOptional()
  status?: string | number;
}
