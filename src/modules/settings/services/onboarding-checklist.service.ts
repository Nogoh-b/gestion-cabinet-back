import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AiRequestLog } from 'src/core/ai-database/entities/ai-request-log.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';

export type OnboardingChecklistStepId =
  | 'client'
  | 'dossier'
  | 'audience'
  | 'document'
  | 'facture'
  | 'ai'
  | 'team';

export interface OnboardingChecklistDto {
  steps: { id: OnboardingChecklistStepId; done: boolean }[];
}

/**
 * Liste « Premiers pas » : chaque étape est cochée d'après les données réelles
 * du cabinet (le patch tenant limite chaque `count` au cabinet courant). Seule
 * la question à l'IA est propre à l'utilisateur.
 */
@Injectable()
export class OnboardingChecklistService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Dossier) private readonly dossiers: Repository<Dossier>,
    @InjectRepository(Audience) private readonly audiences: Repository<Audience>,
    @InjectRepository(DocumentCustomer) private readonly documents: Repository<DocumentCustomer>,
    @InjectRepository(Facture) private readonly factures: Repository<Facture>,
    @InjectRepository(AiRequestLog) private readonly aiRequests: Repository<AiRequestLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async get(userId: number): Promise<OnboardingChecklistDto> {
    // `take: 1` suffit : on veut savoir s'il en existe, pas combien.
    const exists = (repo: Repository<any>, where: object = {}) =>
      repo.count({ where, take: 1 }).then((n) => n > 0);

    const [client, dossier, audience, document, facture, ai, staff] = await Promise.all([
      exists(this.customers),
      exists(this.dossiers),
      exists(this.audiences),
      exists(this.documents),
      exists(this.factures),
      exists(this.aiRequests, { user_id: userId }),
      // Comptes du cabinet, hors comptes du portail client.
      this.users.count({ where: { customer: IsNull() } }),
    ]);

    return {
      steps: [
        { id: 'client', done: client },
        { id: 'dossier', done: dossier },
        { id: 'audience', done: audience },
        { id: 'document', done: document },
        { id: 'facture', done: facture },
        { id: 'ai', done: ai },
        { id: 'team', done: staff > 1 },
      ],
    };
  }
}
