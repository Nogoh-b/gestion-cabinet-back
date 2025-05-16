import { Entity, PrimaryColumn, ManyToOne } from 'typeorm';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { TypeSavingsAccount } from './type-savings-account.entity';

@Entity('type_savings_account_has_documentType')
export class TypeHasDocument {
  @PrimaryColumn()
  type_savings_account_id: number;

  @PrimaryColumn()
  DocumentType_id: number;

  @ManyToOne(() => TypeSavingsAccount)
  type_savings_account: TypeSavingsAccount;

  @ManyToOne(() => DocumentType)
  document_type: DocumentType;
}