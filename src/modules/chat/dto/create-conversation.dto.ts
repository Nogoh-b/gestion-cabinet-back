// src/chat/dto/create-conversation.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsBoolean, IsString, IsNumber } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Liste des IDs des participants',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  participantIds: number[];

  @ApiPropertyOptional({
    description: 'Nom de la conversation (pour les groupes)',
    example: 'Mon Groupe de Chat',
  })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Indique si c\'est une conversation de groupe',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}


// src/chat/dto/send-message.dto.ts

export class SendMessageDto {
  @ApiProperty({
    description: 'ID de la conversation',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  conversationId: number;

  @ApiProperty({
    description: 'Contenu du message',
    example: 'Bonjour, comment ça va ?',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: 'Ids Attachements',
    example: '[23]',
  })
  @IsOptional()
  @IsArray()
  attachmentIds?: number[];

  @ApiProperty({
    description: 'Entites metier referencees dans le message',
    required: false,
    example: [{ type: 'dossier', id: 12, label: '#DOS-001 - Affaire Dupont' }],
  })
  @IsOptional()
  @IsArray()
  references?: ChatReferenceDto[];

}

export interface ChatReferenceDto {
  type: string;
  id: string | number;
  label: string;
  href?: string;
  meta?: {
    reference?: string;
    numero?: string;
    email?: string;
    phone?: string;
    date?: string;
  };
}



// src/chat/dto/create-group.dto.ts

export class CreateGroupDto {
  @ApiProperty({
    description: 'Nom du groupe',
    example: 'Équipe de Développement',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Liste des IDs des participants (en plus du créateur)',
    example: [2, 3, 4],
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  participantIds: number[];
}
