// interfaces/workflow-context.interface.ts

import { EventType } from "../enums/instance-status.enum";
import { ProcedureInstance } from "../procedure-instance.entity";

export interface WorkflowContext {
  instance: ProcedureInstance;
  eventType: EventType;
  eventData: any;
}