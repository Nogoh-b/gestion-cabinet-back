// core/database/entities/base.entity.ts
import {
  BaseEntity as TypeORMBaseEntity,
  DeleteDateColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export abstract class BaseEntity extends TypeORMBaseEntity {

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @CreateDateColumn({ type: 'timestamp',  name: 'created_at' })
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @UpdateDateColumn({ type: 'timestamp',  name: 'updated_at' })
  updated_at: Date;
  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', nullable: true })
  @DeleteDateColumn({ type: 'timestamp',  name: 'deleted_at' })
  deleted_at: Date | null;
 /* @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @PrimaryGeneratedColumn()
  id: number;

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
  }*/
}