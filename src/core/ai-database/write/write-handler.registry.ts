// src/modules/ai/write/write-handler.registry.ts
import { Injectable, Logger } from '@nestjs/common';
import { WriteIntent } from '../interface/write-intent.interface';
import { ValidationResult } from '../interface/entity-write-handler.interface';
import { WritePlan } from '../dto/analysis-response.dto';

@Injectable()
export class WriteHandlerRegistry {
  private readonly logger = new Logger(WriteHandlerRegistry.name);
  private handlers = new Map<string, EntityWriteHandler>();

  /**
   * Enregistre un handler pour une entité
   * Appelé par chaque module via onModuleInit
   */
  register(handler: EntityWriteHandler): void {
    if (this.handlers.has(handler.entityName)) {
      this.logger.warn(`⚠️ Handler déjà enregistré pour ${handler.entityName}, remplacement...`);
    }
    this.handlers.set(handler.entityName, handler);
    this.logger.log(`✅ Handler enregistré: ${handler.entityName}`);
  }

  getHandler(entityName: string): EntityWriteHandler | undefined {
    return this.handlers.get(entityName);
  }

  getAllHandlers(): EntityWriteHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Génère le schéma pour tous les handlers (utilisé par le prompt IA)
   */
  async generateGlobalWriteSchema(): Promise<string> {
    let schema = '# 📝 OPÉRATIONS D\'ÉCRITURE DISPONIBLES\n\n';
    
    for (const handler of this.handlers.values()) {
      const fields = await handler.getWriteableFieldsSchema();
      schema += `## ${handler.entityName}\n`;
      schema += `| Champ | Type | Requis | Description | Exemple |\n`;
      schema += `|-------|------|--------|-------------|---------|\n`;
      
      for (const field of fields) {
        schema += `| ${field.name} (${field.label}) | ${field.type}`;
        schema += field.referenceEntity ? ` → ${field.referenceEntity}` : '';
        schema += ` | ${field.required ? '✅' : '❌'} | ${field.description || ''} | ${field.example || ''} |\n`;
      }
      schema += `\n`;
    }
    
    return schema;
  }
}


// src/modules/ai/write/interfaces/entity-write-handler.interface.ts
export interface EntityWriteHandler<T = any> {
  readonly entityName: string;
  
  getWriteableFieldsSchema(): Promise<WritableFieldSchema[]>;
  validateFields(fields: Partial<T>, operation: 'INSERT' | 'UPDATE'): Promise<ValidationResult>;
  execute(intent: WriteIntent, userId: string): Promise<WriteResult>;
  resolveDependencies?(fields: Partial<T>, userId: string): Promise<Partial<T>>;
}

export interface WritableFieldSchema {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'reference';
  required?: boolean;
  referenceEntity?: string;
  description?: string;
  example?: string;
}

export interface WriteResult {
  success: boolean;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  entityId?: string | number;
  affected: number;
  data?: any;
  message: string;
}

export interface IntentDetectionResult {
  type: 'READ' | 'WRITE';
  writePlan?: WritePlan;
  writeIntent?: WriteIntent;  // Pour compatibilité
  sqlQuery?: string;
  requiresConfirmation: boolean;
}