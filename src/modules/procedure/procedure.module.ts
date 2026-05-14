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
import { StageVisit } from './entities/stage-visit.entity';
import { SubStageVisit } from './entities/sub-stage-visit.entity';

// Write handlers IA
import { TaskWriteHandler } from './write/task-write.handler';
import { ProcedureInstanceWriteHandler } from './write/procedure-instance-write.handler';
import { ProcedureTemplateWriteHandler } from './write/procedure-template-write.handler';
import { StageWriteHandler } from './write/stage-write.handler';
import { SubStageWriteHandler } from './write/sub-stage-write.handler';
import { TransitionWriteHandler } from './write/transition-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

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
      StageVisit,
      HistoryEntry,
      SubStageVisit,
      Task,
    ]),
    AiDatabaseModule,
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
    InstanceMapperService,
    TaskWriteHandler,
    ProcedureInstanceWriteHandler,
    ProcedureTemplateWriteHandler,
    StageWriteHandler,
    SubStageWriteHandler,
    TransitionWriteHandler,
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
export class ProcedureModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly taskHandler: TaskWriteHandler,
    private readonly instanceHandler: ProcedureInstanceWriteHandler,
    private readonly templateHandler: ProcedureTemplateWriteHandler,
    private readonly stageHandler: StageWriteHandler,
    private readonly subStageHandler: SubStageWriteHandler,
    private readonly transitionHandler: TransitionWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.templateHandler);
    this.registry.register(this.stageHandler);
    this.registry.register(this.subStageHandler);
    this.registry.register(this.transitionHandler);
    this.registry.register(this.instanceHandler);
    this.registry.register(this.taskHandler);
  }
}