import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

/**
 * Texte lu d'une pièce jointe du chat IA, gardé avec la conversation : les
 * questions suivantes y ont accès même après un rechargement de la page, et
 * un long document est lu en entier (les passages utiles sont choisis à
 * chaque question).
 */
@Entity('ai_conversation_documents')
@Index('IDX_ai_conversation_documents_conversation', ['tenant_id', 'conversationId'])
export class AiConversationDocument extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'conversation_id', type: 'varchar', length: 36 })
  conversationId: string;

  /** Message utilisateur qui a joint le fichier : les fichiers d'un même envoi vont ensemble. */
  @Column({ name: 'message_id', type: 'int', nullable: true })
  messageId: number | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  type: string | null;

  @Column({ type: 'int', nullable: true })
  size: number | null;

  /** Méthode de lecture (texte, ocr, vision…). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  method: string | null;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ type: 'int', nullable: true })
  pages: number | null;

  /** OCR : part du texte lue avec doute (0-1). */
  @Column({ type: 'float', nullable: true })
  illegible: number | null;

  /** Texte envoyé au modèle (lecture partielle : passages lus avec assurance). */
  @Column({ type: 'longtext' })
  content: string;

  /** Texte complet affiché quand il diffère de `content`. */
  @Column({ name: 'display_content', type: 'longtext', nullable: true })
  displayContent: string | null;
}
