import { BaseEntity } from 'src/core/entities/baseEntity';
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('app_settings')
export class AppSettings extends BaseEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cabinet_id', type: 'int', nullable: true, unique: true })
  cabinet_id: number;

  @OneToOne(() => Branch)
  @JoinColumn({ name: 'cabinet_id' })
  branch: Branch;

  @ApiProperty({ example: 'MonCabinet' })
  @Column({ length: 255, default: 'MonCabinet' })
  cabinet_name: string;
  
  @ApiProperty({ example: null, nullable: true })
  @Column({ 
    nullable: true,
    // type: 'mediumtext', 
    length: 1000000,
    default: '',
  }) 
  cabinet_logo: string;
  /**
   * 🎨 Thème nommé (palette de couleurs).
   * S'applique uniquement en mode clair côté front.
   * En mode sombre, la palette dark fixe est utilisée et theme_name est ignoré.
   */
  @ApiProperty({
    enum: ['ocean', 'silver', 'yellow', 'forest', 'sunset', 'rose'],
    example: 'ocean',
  })
  @Column({
    type: 'enum',
    enum: ['ocean', 'silver', 'yellow', 'forest', 'sunset', 'rose'],
    default: 'ocean',
  })
  theme_name: 'ocean' | 'silver' | 'yellow' | 'forest' | 'sunset' | 'rose';

  @ApiProperty({ example: '' })
  @Column({ type: 'text', default: '' }) 
  cabinet_address: string;

  @ApiProperty({ example: '' })
  @Column({ length: 50, default: '' })
  cabinet_phone: string;

  @ApiProperty({ example: '' })
  @Column({ length: 255, default: '' })
  cabinet_email: string;

  @ApiProperty({ example: '' })
  @Column({ length: 255, default: '' })
  cabinet_website: string;

  @ApiProperty({ example: '' })
  @Column({ length: 255, default: '' })
  cabinet_slogan: string;

  @ApiProperty({ example: '' })
  @Column({ length: 100, default: '' })
  cabinet_rccm: string;

  @ApiProperty({ example: '' })
  @Column({ length: 100, default: '' })
  cabinet_nina: string;

  @ApiProperty({ example: '' })
  @Column({ length: 100, default: '' })
  cabinet_bank_account: string;

  @ApiProperty({ example: 'fr' })
  @Column({ length: 10, default: 'fr' })
  app_locale: string;

  @ApiProperty({ example: 'dd/MM/yyyy' })
  @Column({ length: 20, default: 'dd/MM/yyyy' })
  date_format: string;

  @ApiProperty({ example: 'XAF' })
  @Column({ length: 10, default: 'XAF' })
  currency: string;

  @ApiProperty({ example: 'FAC-' })
  @Column({ length: 20, default: 'FAC-' })
  invoice_prefix: string;

  @ApiProperty({ example: 'DOS-' })
  @Column({ length: 20, default: 'DOS-' })
  dossier_prefix: string;

  @ApiProperty({ example: '08:00' })
  @Column({ length: 5, default: '08:00' })
  working_hours_start: string;

  @ApiProperty({ example: '17:00' })
  @Column({ length: 5, default: '17:00' })
  working_hours_end: string;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: true })
  notification_email: boolean;

  @ApiProperty({ example: false })
  @Column({ type: 'boolean', default: false })
  notification_sms: boolean;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'json', nullable: true })
  smtp_config: object | null;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'text', nullable: true })
  payslip_template: string | null;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'text', nullable: true })
  invoice_template: string | null;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'text', nullable: true })
  dossier_template: string | null;
}