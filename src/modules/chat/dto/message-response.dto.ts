import { Type, Expose } from 'class-transformer';
import { EmployeeResponseDto } from 'src/modules/agencies/employee/dto/employee-response.dto';
import { ApiProperty } from '@nestjs/swagger';

import { ConversationResponseDto } from './conversation-response.dto';


/**
 * DTO de sortie pour un message de conversation.
 * Inclut l'expéditeur (Employee) et la conversation (eager).
 */
export class MessageResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Bonjour, comment allez-vous ?' })
  @Expose()
  content: string;

  @ApiProperty({ example: false })
  @Expose()
  isRead: boolean;

  @ApiProperty({ example: '2025-11-02T10:30:00.000Z' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ type: () => EmployeeResponseDto })
  @Type(() => EmployeeResponseDto)
  @Expose()
  sender: EmployeeResponseDto;

  @ApiProperty({ type: () => ConversationResponseDto })
  @Type(() => ConversationResponseDto)
  @Expose()
  conversation: ConversationResponseDto;
}
