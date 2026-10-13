import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Paramètres de la plateforme (clé → valeur JSON) : identité émettrice des
 * reçus, compteurs, relances, email support… Valeurs par défaut et typage
 * dans PlatformSettingsService.
 */
@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'json', nullable: true })
  value: any;

  @Column({ type: 'int', name: 'updated_by_admin_id', nullable: true })
  updated_by_admin_id: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
