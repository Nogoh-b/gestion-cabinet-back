import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ClientMessageSender = 'client' | 'cabinet';

/**
 * Message échangé entre un client (portail) et le cabinet. Le fil est celui
 * du client ; `dossier_id` rattache optionnellement le message à un dossier.
 * `read_by_*_at` : lu par l'autre partie (client ↔ cabinet).
 */
@Entity('client_messages')
@Index('IDX_client_messages_customer', [
  'tenant_id',
  'customer_id',
  'created_at',
])
// Lecture seule : les messages s’envoient depuis le portail.
@BusinessTable({
  label: 'Messages du portail client',
  description:
    'Messages échangés avec les clients sur le portail : client (customer_id), dossier, expéditeur (sender_type client ou cabinet), contenu, lu par le client / par le cabinet.',
  category: 'communication',
  readOnly: true,
})
export class ClientMessage extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ name: 'customer_id', type: 'int' })
  @BusinessColumn({
    label: 'Client',
    description: 'Client concerné (customer.id)',
  })
  customer_id: number;

  @Column({ name: 'dossier_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier concerné (dossiers.id)',
  })
  dossier_id: number | null;

  @Column({ name: 'sender_type', type: 'varchar', length: 10 })
  @BusinessColumn({
    label: 'Expéditeur',
    description: 'BD: client=Client, cabinet=Cabinet',
  })
  sender_type: ClientMessageSender;

  @Column({ name: 'sender_user_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Expéditeur (utilisateur)',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  sender_user_id: number | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 150, nullable: true })
  @BusinessColumn({
    label: "Nom de l'expéditeur",
    description: "Nom affiché de l'expéditeur",
  })
  sender_name: string | null;

  @Column({ type: 'text' })
  @BusinessColumn({
    label: 'Message',
    description: 'Texte du message',
    importance: 'critical',
  })
  content: string;

  @Column({ name: 'read_by_client_at', type: 'datetime', nullable: true })
  @BusinessColumn({
    label: 'Lu par le client le',
    description: 'Date de lecture par le client',
    format: 'date',
  })
  read_by_client_at: Date | null;

  @Column({ name: 'read_by_cabinet_at', type: 'datetime', nullable: true })
  @BusinessColumn({
    label: 'Lu par le cabinet le',
    description: 'Date de lecture par le cabinet',
    format: 'date',
  })
  read_by_cabinet_at: Date | null;
}
