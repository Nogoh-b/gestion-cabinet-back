// interfaces/workflow-context.interface.ts
import { EventType } from '../entities/enums/instance-status.enum';
import { ProcedureInstance } from '../entities/procedure-instance.entity';

export interface WorkflowContext {
  instance: ProcedureInstance;
  eventType: EventType;
  eventData: any;
}