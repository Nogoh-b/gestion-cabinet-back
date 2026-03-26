// dto/trigger-event.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional } from 'class-validator';

export class TriggerEventDto {
  @ApiProperty({
    description: 'Type d\'événement à déclencher',
    example: 'document_uploaded',
    enum: ['document_uploaded', 'payment_received', 'deadline_passed', 'decision_made']
  })
  @IsString()
  eventType: string;

  @ApiProperty({
    description: 'Données associées à l\'événement',
    example: {
      documentId: 'doc-123',
      documentType: 'contract',
      uploadedBy: 'user-456'
    },
    required: false
  })
  @IsObject()
  @IsOptional()
  eventData?: any;
}