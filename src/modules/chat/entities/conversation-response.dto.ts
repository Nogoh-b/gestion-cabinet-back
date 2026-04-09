// src/chat/dto/response/conversation-response.dto.ts
import { Expose, Type } from 'class-transformer';
import { EmployeeResponseDto } from 'src/modules/agencies/employee/dto/response-employee.dto';
import { MessageResponseDto } from '../dto/message-response.dto';
import { DossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';

export class LastMessageDataDto {
  @Expose()
  content: string;

  @Expose()
  createdAt: string;

  @Expose()
  senderId: number;

  @Expose()
  senderName: string;
}

export class ConversationResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  isGroup: boolean;

  @Expose()
  @Type(() => EmployeeResponseDto)
  participants: EmployeeResponseDto[];

  @Expose()
  @Type(() => MessageResponseDto)
  messages: MessageResponseDto[];

  @Expose()
  @Type(() => DossierResponseDto)
  dossier: DossierResponseDto;

  @Expose()
  createdAt: Date;

  @Expose()
  lastMessageAt: Date;

  @Expose()
  lastMessageData?: LastMessageDataDto;

  // Le getter lastMessage sera automatiquement exposé si @Expose() est présent
  @Expose()
  get lastMessage(): LastMessageDataDto | undefined {
    return this.lastMessageData;
  }
}