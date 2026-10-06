/**
 * TenantSeederService
 *
 * Exécute les seeders de données de référence (types d'audience, types de
 * client, juridictions, templates, permissions, rôles, etc.) dans le contexte
 * d'un cabinet nouvellement créé.
 *
 * Principe : chaque cabinet reçoit SA propre copie des données de référence
 * (tenant_id = cabinet.id) pour pouvoir les personnaliser indépendamment.
 *
 * Le service wrappe l'appel dans TenantContext.run(cabinetId) afin que les
 * @BeforeInsert() de TenantEntity et le patch Repository.save() injectent
 * automatiquement le bon tenant_id sur chaque ligne créée.
 *
 * Le Plan (entité globale sans tenant_id) est exclu — il est seedé au
 * démarrage et partagé entre tous les cabinets.
 */
import { PermissionSeeder } from 'src/core/auth/seeders/permission.seeder';
import {
  ROLES_CONFIG,
  RoleSeeder,
} from 'src/core/auth/seeders/role.seeder';
import { TenantContext } from 'src/core/tenant/tenant.context';
import AudienceTypeSeeder from 'src/modules/audience-type/seeder/audience-type.seeder';
// ── Seeders IAM (permissions & rôles par cabinet) ─────────────────────────
import ChatGroupConversationSeeder from 'src/modules/chat/seeder/chat-group-conversation.seeder';
import TypeCustomerSeeder from 'src/modules/customer/type-customer/seeder/type-customer.seeder';
// ── Seeders métier (données de référence par cabinet) ──────────────────────
import DocumentCategorySeeder from 'src/modules/document-category/seeder/document-category.seeder';
import DocumentTypeSeeder from 'src/modules/documents/document-type/seeder/document-type.seeder';
import InvoiceTypeSeeder from 'src/modules/invoice-type/seeder/invoice-type.seeder';
import JurisdictionSeeder from 'src/modules/jurisdiction/seeder/jurisdiction.seeder';
import MailComposerTemplateSeeder from 'src/modules/mail-template/seeder/mail-composer-template.seeder';
import MailTemplateSeeder from 'src/modules/mail-template/seeder/mail-template.seeder';
import PdfTemplateSeeder from 'src/modules/pdf-templates/seeder/pdf-template.seeder';
import DefaultProcedureTemplateSeeder from 'src/modules/procedure/seeder/default-procedure-template.seeder';
import ProcedureTemplateSeeder from 'src/modules/procedure/seeder/procedure-template.seeder';
import ProcedureSubtypeSeeder from 'src/modules/procedures/seeder/procedure-subtype.seeder';
import ProcedureTypeSeeder from 'src/modules/procedures/seeder/procedure-type.seeder';
import TemplateBlockSeeder from 'src/modules/template-blocks/seeder/template-block.seeder';
import { Repository, DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Cabinet } from './entities/cabinet.entity';

@Injectable()
export class TenantSeederService {
  private readonly logger = new Logger(TenantSeederService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
    private readonly permissionSeeder: PermissionSeeder,
    private readonly roleSeeder: RoleSeeder,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
  ) {}

  /**
   * Seed toutes les données de référence pour un cabinet (nouveau OU déjà
   * existant — tous les seeders listés ici sont idempotents par tenant :
   * ils ne créent que ce qui manque, jamais de doublon). Exécuté dans le
   * contexte tenant du cabinet ciblé.
   */
  private async seedReferenceData(cabinetId: number): Promise<void> {
    await this.tenantContext.run(cabinetId, async () => {
      // ── 1. IAM : permissions puis rôles (les rôles dépendent des permissions) ──
      await this.seedIamReferenceData();

      // ── 2. Données de référence métier ──────────────────────────────────────
      await runSeeders(this.dataSource, {
        seeds: [
          // Référentiels juridiques
          JurisdictionSeeder,
          // Types & catégories
          DocumentCategorySeeder,
          DocumentTypeSeeder,
          AudienceTypeSeeder,
          TypeCustomerSeeder,
          InvoiceTypeSeeder,
          // Procédures
          ProcedureTypeSeeder,
          ProcedureSubtypeSeeder,
          DefaultProcedureTemplateSeeder,
          ProcedureTemplateSeeder,
          // Templates (mail, PDF, blocs)
          PdfTemplateSeeder,
          MailTemplateSeeder,
          MailComposerTemplateSeeder,
          TemplateBlockSeeder,
          // Chat
          ChatGroupConversationSeeder,
        ],
      });
    });
  }

  /**
   * Réconcilie uniquement l'IAM dans le contexte tenant courant.
   *
   * Le seeding reste additif : PermissionSeeder ne crée que les permissions
   * absentes et RoleSeeder ne complète un rôle existant qu'avec les permissions
   * qui viennent réellement d'être créées. Les choix manuels d'un administrateur
   * ne sont donc jamais réinitialisés.
   */
  private async seedIamReferenceData(): Promise<void> {
    const createdCodes = await this.permissionSeeder.seed();
    await this.roleSeeder.seed(createdCodes);
  }

  /**
   * Seed toutes les données de référence pour un nouveau cabinet.
   *
   * @param cabinetId — ID du cabinet (= tenant_id).
   */
  async seedForNewCabinet(cabinetId: number): Promise<void> {
    this.logger.log(`🚀 Seeding de référence pour cabinet #${cabinetId}…`);
    await this.seedReferenceData(cabinetId);
    this.logger.log(`✅ Seeding terminé pour cabinet #${cabinetId}`);
  }

  /**
   * Re-synchronise les données de référence de TOUS les cabinets existants
   * (y compris le cabinet #1, jamais couvert par `CabinetSubscriber` qui
   * l'ignore volontairement — voir son commentaire).
   *
   * Comble l'écart qui apparaît chaque fois qu'une permission, un rôle ou un
   * template est ajouté au code APRÈS la création d'un cabinet : ces
   * seeders ne tournaient jusqu'ici qu'une seule fois, à la création du
   * cabinet, et n'étaient donc jamais rejoués pour les cabinets déjà actifs.
   * Sans danger à ré-exécuter : chaque seeder ne crée que ce qui manque
   * (vérifié par tenant), et `RoleSeeder` n'accorde aux rôles déjà existants
   * QUE les permissions tout juste créées — jamais celles déjà en base,
   * potentiellement désactivées manuellement par un admin.
   */
  async syncReferenceDataForAllTenants(): Promise<void> {
    const cabinets = await this.cabinetRepo.find({ select: ['id'] });
    this.logger.log(
      `🔄 Re-synchronisation des données de référence pour ${cabinets.length} cabinet(s)…`,
    );

    for (const { id } of cabinets) {
      try {
        await this.seedReferenceData(id);
        this.logger.log(`✅ Cabinet #${id} : données de référence à jour.`);
      } catch (err) {
        // Un échec sur un cabinet ne doit jamais empêcher la synchronisation
        // des autres (ni bloquer le démarrage de l'application).
        this.logger.error(
          `❌ Échec de la synchronisation pour le cabinet #${id} : ${(err as Error)?.message ?? err}`,
        );
      }
    }

    this.logger.log('🔄 Re-synchronisation des données de référence terminée.');
  }

  /**
   * Rattrape les permissions et rôles manquants de tous les cabinets existants.
   *
   * Cette synchronisation IAM est volontairement séparée du seeding complet :
   * elle peut être exécutée à chaque démarrage, y compris lorsque RUN_SEEDERS
   * est désactivé, sans lancer tous les seeders métier plus coûteux.
   */
  async syncIamReferenceDataForAllTenants(): Promise<void> {
    const cabinets = await this.cabinetRepo.find({ select: ['id'] });
    const existingRoles: Array<{ tenant_id: number; code: string }> =
      await this.dataSource.query('SELECT tenant_id, code FROM user_role');
    const roleCodesByTenant = new Map<number, Set<string>>();

    for (const role of existingRoles) {
      const tenantId = Number(role.tenant_id);
      const codes = roleCodesByTenant.get(tenantId) ?? new Set<string>();
      codes.add(role.code);
      roleCodesByTenant.set(tenantId, codes);
    }

    const expectedRoleCodes = ROLES_CONFIG.map((role) => role.code);
    const cabinetsToRepair = cabinets.filter(({ id }) => {
      const existingCodes = roleCodesByTenant.get(id) ?? new Set<string>();
      return expectedRoleCodes.some((code) => !existingCodes.has(code));
    });

    this.logger.log(
      `🔐 Réconciliation IAM : ${cabinetsToRepair.length}/${cabinets.length} cabinet(s) à réparer…`,
    );

    for (const { id } of cabinetsToRepair) {
      try {
        await this.tenantContext.run(id, () => this.seedIamReferenceData());
        this.logger.log(`✅ Cabinet #${id} : IAM à jour.`);
      } catch (err) {
        // Un cabinet incomplet ne doit pas empêcher les autres d'être réparés.
        this.logger.error(
          `❌ Cabinet #${id} : échec de la réconciliation IAM : ${(err as Error)?.message ?? err}`,
        );
      }
    }

    this.logger.log('🔐 Réconciliation IAM terminée.');
  }
}
