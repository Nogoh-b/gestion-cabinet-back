import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Repository } from 'typeorm';

/** Empêche toute nouvelle écriture dans l'ancien moteur après confirmation V2. */
@Injectable()
export class LegacyWorkflowMutationGuard {
  constructor(@InjectRepository(Dossier) private readonly dossierRepository: Repository<Dossier>) {}

  async assertMutable(procedureInstanceId: string): Promise<void> {
    const dossier = await this.dossierRepository.findOne({
      where: { procedureInstanceId },
      select: ['id', 'legacy_workflow_locked'],
    });
    if (dossier?.legacy_workflow_locked) {
      throw new ConflictException(
        `Le workflow historique du dossier ${dossier.id} est en lecture seule depuis la confirmation du parcours V2`,
      );
    }
  }
}

