// core/database/entities/base.entity.ts
import { BaseEntity as TypeORMBaseEntity, BeforeInsert, BeforeUpdate } from 'typeorm';
import { validateOrReject } from 'class-validator';

export abstract class BaseEntity extends TypeORMBaseEntity {

  /*@ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;*/
 /* @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @PrimaryGeneratedColumn()
  id: number;

  // @ApiProperty({ example: '2023-01-01T00:00:00.000Z', nullable: true })
  // @DeleteDateColumn({ type: 'timestamp' })
  // deleted_at: Date | null;
*/
  // --------------------------------------------------
  // Lifecycle Hooks (Validation automatique)
  // --------------------------------------------------
  @BeforeInsert()
  @BeforeUpdate()
  async validate() {
    await validateOrReject(this, {
      validationError: { target: false },
      forbidUnknownValues: true,
    });
  }
}