// src/chat/dto/message-response.dto.ts
import { Type } from 'class-transformer';
import { EmployeeResponseDto } from 'src/modules/agencies/employee/dto/response-employee.dto';
import { ApiProperty } from '@nestjs/swagger';


import { Conversation } from '../entities/conversation.entity';



export class MessageResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: () => EmployeeResponseDto })
  @Type(() => EmployeeResponseDto)
  sender: EmployeeResponseDto;

  @ApiProperty({ type: () => Conversation })
  @Type(() => Conversation)
  conversation: Conversation;
}
