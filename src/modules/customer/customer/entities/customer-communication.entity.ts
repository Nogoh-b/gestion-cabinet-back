import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
// src/modules/customer/customer-communication/entities/customer-communication.entity.ts
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum CommunicationType {
  EMAIL = 'email',
  PHONE = 'phone',
  MEETING = 'meeting',
  LETTER = 'letter',
  /** Message préparé par le chat et envoyé depuis le WhatsApp de l'utilisateur. */
  WHATSAPP = 'whatsapp',
}

export enum CommunicationStatus {
  SENT = 'sent',
  RECEIVED = 'received',
  PLANNED = 'planned',
  CANCELLED = 'cancelled',
}

@Entity('customer_communication')
@BusinessTable({
  label: 'Communications avec les clients',
  description:
    'Historique des échanges avec un client (appel, e-mail, réunion…) : type, objet, contenu, date, statut, durée, participants.',
  category: 'client',
  readOnly: true,
})
export class CustomerCommunication extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @ManyToOne(() => Customer, (customer) => customer.communications)
  customer: Customer;

  @Column({ type: 'enum', enum: CommunicationType })
  type: CommunicationType;

  @Column()
  @BusinessColumn({
    label: 'Objet',
    description: "Objet de l'échange",
    importance: 'critical',
  })
  subject: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Contenu',
    description: "Compte rendu de l'échange",
  })
  content: string;

  @Column({
    type: 'timestamp',
    nullable: false,
    default: () => 'CURRENT_TIMESTAMP',
  })
  date: Date | null;

  @Column({
    type: 'enum',
    enum: CommunicationStatus,
    default: CommunicationStatus.SENT,
  })
  status: CommunicationStatus;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Durée (min)',
    description: "Durée de l'appel en minutes",
  })
  duration: number; // en minutes pour les appels

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Participants',
    description: "Participants à l'échange",
  })
  participants: string; // participants à la communication
}
