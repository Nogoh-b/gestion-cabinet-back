import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ClientMessageSender = 'client' | 'cabinet';

/**
 * Message échangé entre un client (portail) et le cabinet. Le fil est celui
 * du client ; `dossier_id` rattache optionnellement le message à un dossier.
 * `read_by_*_at` : lu par l'autre partie (client ↔ cabinet).
 */
@Entity('client_messages')
@Index('IDX_client_messages_customer', ['tenant_id', 'customer_id', 'created_at'])
export class ClientMessage extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id', type: 'int' })
  customer_id: number;

  @Column({ name: 'dossier_id', type: 'int', nullable: true })
  dossier_id: number | null;

  @Column({ name: 'sender_type', type: 'varchar', length: 10 })
  sender_type: ClientMessageSender;

  @Column({ name: 'sender_user_id', type: 'int', nullable: true })
  sender_user_id: number | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 150, nullable: true })
  sender_name: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'read_by_client_at', type: 'datetime', nullable: true })
  read_by_client_at: Date | null;

  @Column({ name: 'read_by_cabinet_at', type: 'datetime', nullable: true })
  read_by_cabinet_at: Date | null;
}
