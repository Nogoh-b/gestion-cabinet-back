// core/database/entities/base.ts
import {
  BaseEntity as TypeORMBaseEntity,
  DeleteDateColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';


export abstract class BaseEntity extends TypeORMBaseEntity {

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @CreateDateColumn({ type: 'datetime', name: 'created_at', nullable: false, default: () => 'CURRENT_TIMESTAMP(6)' })
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  @UpdateDateColumn({ type: 'datetime', name: 'updated_at', nullable: false, default: () => 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)' })
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