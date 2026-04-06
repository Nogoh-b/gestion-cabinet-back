// procedure.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ProcedureTemplate } from './entities/procedure-template.entity';
import { Stage } from './entities/stage.entity';
import { SubStage } from './entities/sub-stage.entity';
import { Transition } from './entities/transition.entity';
import { ProcedureInstance } from './entities/procedure-instance.entity';
import { Decision } from './entities/decision.entity';
import { Task } from './entities/task.entity';

// Services
import { ProcedureTemplateService } from './services/procedure-template.service';
import { ProcedureInstanceService } from './services/procedure-instance.service';
import { WorkflowService } from './services/workflow.service';
import { TaskService } from './services/task.service';
import { HistoryService } from './services/history.service';

// Controllers
import { ProcedureTemplateController } from './controllers/procedure-template.controller';
import { ProcedureInstanceController } from './controllers/procedure-instance.controller';
import { TaskController } from './controllers/task.controller';
import { HistoryEntry } from './entities/history-entry.entity';
import { Cycle } from './entities/cycle.entity';
import { StageConfig } from './entities/stage-config.entity';
import { InstanceMapperService } from './services/instance-sub-stage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcedureTemplate,
      Stage,
      SubStage,
      Transition,
      ProcedureInstance,
      Cycle,
      Decision,
      StageConfig,
      HistoryEntry,
      Task,
    ]),
  ],
  controllers: [
    ProcedureTemplateController,
    ProcedureInstanceController,
    TaskController,
  ],
  providers: [
    ProcedureTemplateService,
    ProcedureInstanceService,
    WorkflowService,
    TaskService,
    HistoryService,
    InstanceMapperService
  ],
  exports: [
    ProcedureTemplateService,
    ProcedureInstanceService,
    WorkflowService,
    TaskService,
    HistoryService,
    TypeOrmModule
  ],
})
export class ProcedureModule {}