import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ReferenceAdapter } from './reference-adapter';
import {
  ReferenceDeployment,
  ReferenceDeploymentTarget,
  ReferenceRevision,
} from './entities/reference-data.entity';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { PlatformAuditLog } from '../platform/entities/platform-audit-log.entity';

@Injectable()
export class ReferenceDeploymentWorker {
  private busy = false;
  private readonly logger = new Logger(ReferenceDeploymentWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly adapter: ReferenceAdapter,
    private readonly tenant: TenantContext,
  ) {}
  @Interval(2000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    let targetId: string | undefined, runId: string | undefined;
    try {
      await this.db.transaction(async (em) => {
        const target = await em
          .getRepository(ReferenceDeploymentTarget)
          .createQueryBuilder('t')
          .where('t.status=:status', { status: 'pending' })
          .orderBy('t.updated_at', 'ASC')
          .take(1)
          .setLock('pessimistic_write')
          .getOne();
        if (!target) return;
        targetId = target.id;
        runId = target.deployment_id;
        const run = await em.findOneByOrFail(ReferenceDeployment, {
          id: target.deployment_id,
        });
        const revision = await em.findOneByOrFail(ReferenceRevision, {
          id: run.revision_id,
          status: 'published',
        });
        const result = await this.tenant.run(target.cabinet_id, () =>
          this.adapter.apply(
            target.cabinet_id,
            revision.id,
            revision.content,
            target.changes,
            target.overrides,
            em,
          ),
        );
        target.status = 'completed';
        target.error = null;
        target.result = result;
        await em.save(ReferenceDeploymentTarget, target);
        await em.insert(PlatformAuditLog, {
          admin_id: run.created_by,
          action: 'reference.deployment.applied',
          target_type: 'reference_deployment',
          target_id: run.id,
          cabinet_id: target.cabinet_id,
          summary: 'Référentiels appliqués au cabinet',
          after: result as any,
          outcome: 'success',
        });
      });
    } catch (error) {
      this.logger.error(
        'Application des référentiels : ' + (error as Error).message,
      );
      if (targetId)
        await this.db
          .getRepository(ReferenceDeploymentTarget)
          .update(targetId, {
            status: 'failed',
            error: (error as Error).message.slice(0, 6000),
          });
    } finally {
      try {
        if (runId) {
          const targets = await this.db
            .getRepository(ReferenceDeploymentTarget)
            .findBy({ deployment_id: runId });
          const pending = targets.some((t) => t.status === 'pending');
          await this.db.getRepository(ReferenceDeployment).update(runId, {
            status: pending
              ? 'running'
              : targets.some((t) => t.status === 'failed')
                ? 'failed'
                : 'completed',
          });
        }
      } finally {
        this.busy = false;
      }
    }
  }
}
