import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('user_settings')
export class UserSettings {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int', nullable: true, unique: true })
  user_id: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ example: 'system' })
  @Column({ length: 10, default: 'system' })
  user_theme: string;

  @ApiProperty({ example: 'md' })
  @Column({ length: 5, default: 'md' })
  user_font_size: string;

  @ApiProperty({ example: 'fr' })
  @Column({ length: 10, default: 'fr' })
  user_language: string;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: true })
  user_notifications_enabled: boolean;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: true })
  user_email_notifications: boolean;

  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: true })
  user_in_app_notifications: boolean;

  @ApiProperty({ example: false })
  @Column({ type: 'boolean', default: false })
  user_sidebar_collapsed: boolean;

  @ApiProperty({ example: 10 })
  @Column({ type: 'int', default: 10 })
  user_items_per_page: number;

  @ApiProperty({ example: '/dashboard' })
  @Column({ length: 255, default: '/dashboard' })
  user_default_dashboard: string;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'text', nullable: true })
  user_signature: string | null;

  @ApiProperty({ example: null, nullable: true })
  @Column({ type: 'text', nullable: true })
  user_avatar: string | null;

  @ApiProperty({ example: '' })
  @Column({ length: 50, default: '' })
  user_phone: string;
}