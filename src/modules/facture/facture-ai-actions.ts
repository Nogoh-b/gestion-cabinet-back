// src/modules/facture/facture-ai-actions.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  AiActionDefinition,
  AiActionHandler,
  PreparedAiAction,
} from 'src/core/ai-database/write/ai-action.registry';
import { Permission } from 'src/core/enums/permission.enum';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { FactureService } from './facture.service';

const IRREVERSIBLE = "L'e-mail part dès la confirmation : il ne pourra pas être rappelé.";

const amount = (value: number) =>
  Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/**
 * « Envoie la facture FAC-2026-0003 au client » : même envoi que le bouton
 * « Envoyer » de la fiche facture (une facture au brouillon passe « Envoyée »).
 */
@Injectable()
export class EnvoyerFactureAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'envoyer_facture',
    entity: 'factures',
    label: 'Envoi de la facture par e-mail',
    description:
      "Envoie une facture au client par e-mail (récapitulatif : numéro, dates, montant TTC, reste à payer). Une facture au brouillon passe au statut « Envoyée ».",
    permission: Permission.EMAIL_FACTURE,
    params: [
      {
        name: 'email',
        label: 'Destinataire',
        description: "Facultatif : par défaut, l'e-mail du client de la facture",
      },
    ],
    examples: [
      'envoie la facture FAC-2026-0003 au client',
      'transmets cette facture à compta@client.com',
    ],
    warning: IRREVERSIBLE,
  };

  constructor(private readonly factures: FactureService) {}

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    const { to } = await this.factures.previewFactureEmail(String(targetId), params.email);
    return `À : ${to}`;
  }

  async prepare(targetId: string | number, params: Record<string, any>): Promise<PreparedAiAction> {
    const { facture, to } = await this.factures.previewFactureEmail(String(targetId), params.email);
    return {
      data: facture,
      plannedMessage: `Facture ${facture.numero} à envoyer à ${to}.`,
      run: async () => (await this.factures.sendFactureByEmail(String(targetId), params.email)).message,
    };
  }
}

/**
 * « Relance le client du dossier DOS-2026-0001 » : même e-mail que le bouton
 * « Envoyer relance » du dossier (toutes ses factures non soldées).
 */
@Injectable()
export class RelancerImpayesAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'relancer_impayes',
    entity: 'dossiers',
    label: 'Relance des factures impayées',
    description:
      "Envoie au client d'un dossier un e-mail de relance listant toutes les factures non soldées du dossier (montant TTC et reste dû).",
    permission: Permission.EMAIL_FACTURE,
    params: [],
    examples: [
      'relance le client du dossier DOS-2026-0001',
      'envoie une relance pour les impayés de ce dossier',
    ],
    warning: IRREVERSIBLE,
  };

  constructor(
    private readonly factures: FactureService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async preview(targetId: string | number): Promise<string> {
    const { to, count, totalReste } = await this.factures.previewRelanceForDossier(String(targetId));
    return `À : ${to} · ${count} facture(s) impayée(s), reste dû ${amount(totalReste)}`;
  }

  async prepare(targetId: string | number): Promise<PreparedAiAction> {
    const dossier = await this.dataSource.getRepository(Dossier).findOne({ where: { id: Number(targetId) } as any });
    if (!dossier) throw new NotFoundException(`Dossier #${targetId} introuvable dans ce cabinet.`);
    const { to, count, totalReste } = await this.factures.previewRelanceForDossier(String(dossier.id));
    return {
      data: dossier,
      plannedMessage: `Relance à envoyer à ${to} (${count} facture(s), reste dû ${amount(totalReste)}).`,
      run: async () => {
        const result = await this.factures.sendRelanceForDossier(String(dossier.id));
        // Le service renvoie `sent: false` (sans lever) quand rien ne part.
        if (!result.sent) throw new BadRequestException(result.message);
        return result.message;
      },
    };
  }
}
