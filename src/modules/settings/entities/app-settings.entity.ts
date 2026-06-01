import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('app_settings')
export class AppSettings  {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Référence vers le cabinet (tenant) propriétaire de ces paramètres.
   * cabinet_id = cabinets.id (PK du cabinet, alias tenant_id dans TenantEntity).
   */
  @Column({ name: 'cabinet_id', type: 'int', nullable: true, unique: true })
  cabinet_id: number;

  @OneToOne(() => Cabinet)
  @JoinColumn({ name: 'cabinet_id' })
  cabinet: Cabinet;

  @ApiProperty({ example: 'MonCabinet' })
  @Column({ length: 255, default: 'MonCabinet' })
  cabinet_name: string;
  
  @ApiProperty({ example: null, nullable: true })
  @Column({ 
    nullable: true,
    type: 'longtext', 
    // length: 1000000,
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

  /* ── Polices configurables (clé de FONTS côté front) ─────────────────── */
  @ApiProperty({ example: 'inter' })
  @Column({ length: 50, default: 'inter' })
  font_ui: string;

  @ApiProperty({ example: 'inter' })
  @Column({ length: 50, default: 'inter' })
  font_heading: string;

  @ApiProperty({ example: 'jetbrains_mono' })
  @Column({ length: 50, default: 'jetbrains_mono' })
  font_mono: string;

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

  /** Largeur du compteur de facture (padding zéros). Ex: 4 → 0001. */
  @ApiProperty({ example: 4 })
  @Column({ type: 'int', default: 4, name: 'invoice_padding' })
  invoice_padding: number;

  /**
   * Stratégie de remise à zéro du compteur :
   *  - yearly    : FAC-2026-0001 (reset chaque année — défaut)
   *  - monthly   : FAC-202605-0001 (reset chaque mois)
   *  - continuous: FAC-0001 (jamais de reset)
   */
  @ApiProperty({ enum: ['yearly', 'monthly', 'continuous'], example: 'yearly' })
  @Column({
    type: 'enum',
    enum: ['yearly', 'monthly', 'continuous'],
    default: 'yearly',
    name: 'invoice_numbering_strategy',
  })
  invoice_numbering_strategy: 'yearly' | 'monthly' | 'continuous';

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