/**
 * @deprecated Utilisez GenericWriteService à la place.
 *
 * Ce service est conservé uniquement pour compatibilité.
 * GenericWriteService offre :
 *   - Fallback TypeORM générique quand aucun handler n'est enregistré
 *   - Filtrage des champs protégés (sanitizeFields)
 *   - Blocage des DELETE
 *   - Support des deux formats de référence ({{tempId.field}} et $tempId.field)
 *
 * Tous les appels internes passent désormais par GenericWriteService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { GenericWriteService } from '../generic-write.service';
import { WriteResult } from './write-handler.registry';
import { WritePlan } from '../dto/analysis-response.dto';

@Injectable()
export class AiWriteService {
  private readonly logger = new Logger(AiWriteService.name);

  constructor(private readonly genericWriteService: GenericWriteService) {}

  /**
   * @deprecated Utilisez GenericWriteService.executePlan() directement.
   */
  async executePlan(writePlan: WritePlan, userId: string): Promise<WriteResult[]> {
    this.logger.warn('⚠️ AiWriteService.executePlan() est déprécié, délégation à GenericWriteService');
    return this.genericWriteService.executePlan(writePlan, userId);
  }
}
