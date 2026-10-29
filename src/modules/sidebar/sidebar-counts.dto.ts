import { ApiProperty } from '@nestjs/swagger';

/**
 * Compteurs affichés en badge dans la sidebar. Un compteur auquel l'utilisateur
 * n'a pas droit vaut 0 (le front masque le badge à 0).
 */
export class SidebarCountsDto {
  @ApiProperty({ description: 'Badges activés pour ce cabinet par la plateforme' })
  enabled: boolean;

  @ApiProperty({ description: 'Dossiers actifs de danger élevé/critique ou de priorité ≥ 2' })
  dossiersUrgents: number;

  @ApiProperty({ description: "Audiences programmées ou en cours dont la date est aujourd'hui" })
  audiencesDuJour: number;

  @ApiProperty({ description: "Audiences au statut « en cours » (0 tant que ce statut n'existe pas)" })
  audiencesEnCours: number;

  @ApiProperty({ description: 'Factures émises restant à encaisser' })
  facturesImpayees: number;

  @ApiProperty({ description: 'Documents en attente de validation' })
  documentsEnAttente: number;
}

export type SidebarCountKey = Exclude<keyof SidebarCountsDto, 'enabled'>;

export const EMPTY_SIDEBAR_COUNTS: Record<SidebarCountKey, number> = {
  dossiersUrgents: 0,
  audiencesDuJour: 0,
  audiencesEnCours: 0,
  facturesImpayees: 0,
  documentsEnAttente: 0,
};
