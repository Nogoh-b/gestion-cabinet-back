// src/modules/plans/storage-usage.service.ts
//
// Unique calcul de l'espace utilisé par un cabinet. Il sert à la fois à
// l'application du quota (PlanQuotaService.checkStorageLimit) et à son
// affichage (PlansService.getQuotaStatus) : les deux ne peuvent plus diverger.
//
// Espace compté (lignes non supprimées, c'est ce que le cabinet voit et peut
// libérer) : documents + versions archivées des documents + exports ZIP, plus
// toute source ajoutée par un autre module via `registerSource` (ex. les
// enregistrements audio d'audience du Lot 5).
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Octets occupés par un cabinet pour une source donnée. */
export type StorageSource = (tenantId: number) => Promise<number>;

export interface StorageBreakdown {
  documents: number;
  versions: number;
  exports: number;
  /** Sources enregistrées via `registerSource`, par nom. */
  extra: Record<string, number>;
  total: number;
}

/** Tables à sommer : `SUM(file_size)` filtré par tenant, hors suppressions logiques. */
const TABLES = {
  documents: 'document_customer',
  versions: 'document_customer_versions',
  exports: 'dossier_exports',
} as const;

@Injectable()
export class StorageUsageService {
  private readonly extraSources = new Map<string, StorageSource>();

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Point d'extension : un module qui stocke des fichiers pour le cabinet
   * (ex. `audience_recordings`) déclare ici sa source, typiquement dans
   * `onModuleInit`. Réenregistrer le même nom remplace la source.
   */
  registerSource(name: string, source: StorageSource): void {
    this.extraSources.set(name, source);
  }

  /** Espace total utilisé (octets) par le cabinet. */
  async getUsedBytes(tenantId: number): Promise<number> {
    return (await this.getBreakdown(tenantId)).total;
  }

  async getBreakdown(tenantId: number): Promise<StorageBreakdown> {
    const [documents, versions, exports] = await Promise.all([
      this.sumTable(TABLES.documents, tenantId),
      this.sumTable(TABLES.versions, tenantId),
      this.sumTable(TABLES.exports, tenantId),
    ]);
    const extra: Record<string, number> = {};
    await Promise.all(
      [...this.extraSources].map(async ([name, source]) => {
        extra[name] = Math.max(0, Number(await source(tenantId)) || 0);
      }),
    );
    const total =
      documents +
      versions +
      exports +
      Object.values(extra).reduce((sum, bytes) => sum + bytes, 0);
    return { documents, versions, exports, extra, total };
  }

  private async sumTable(table: string, tenantId: number): Promise<number> {
    const rows = await this.db.query(
      `SELECT COALESCE(SUM(file_size), 0) AS total FROM ${table} WHERE tenant_id = ? AND deleted_at IS NULL`,
      [tenantId],
    );
    return Number(rows?.[0]?.total ?? 0) || 0;
  }
}
