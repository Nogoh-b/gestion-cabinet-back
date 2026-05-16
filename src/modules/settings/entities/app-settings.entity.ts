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
  @Column({ type: 'text', nullable: true })
  cabinet_logo: string | null;

  // 🎨 Couleurs du thème personnalisables
  @ApiProperty({ example: '#2563eb' })
  @Column({ length: 7, default: '#2563eb' })
  theme_primary_color: string;

  @ApiProperty({ example: '#7c3aed' })
  @Column({ length: 7, default: '#7c3aed' })
  theme_secondary_color: string;

  @ApiProperty({ example: '#f59e0b' })
  @Column({ length: 7, default: '#f59e0b' })
  theme_accent_color: string;

  @ApiProperty({ example: '#1e293b' })
  @Column({ length: 7, default: '#1e293b' })
  theme_sidebar_color: string;

  @ApiProperty({ example: '#ffffff' })
  @Column({ length: 7, default: '#ffffff' })
  theme_sidebar_text: string;

  @ApiProperty({ example: '0.5rem' })
  @Column({ length: 10, default: '0.5rem' })
  theme_radius: string;

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