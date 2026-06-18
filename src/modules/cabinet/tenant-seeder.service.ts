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
import { RoleSeeder } from 'src/core/auth/seeders/role.seeder';
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
import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TenantSeederService {
  private readonly logger = new Logger(TenantSeederService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
    private readonly permissionSeeder: PermissionSeeder,
    private readonly roleSeeder: RoleSeeder,
  ) {}

  /**
   * Seed toutes les données de référence pour un nouveau cabinet.
   *
   * @param cabinetId — ID du cabinet (= tenant_id).
   */
  async seedForNewCabinet(cabinetId: number): Promise<void> {
    this.logger.log(`🚀 Seeding de référence pour cabinet #${cabinetId}…`);

    await this.tenantContext.run(cabinetId, async () => {
      // ── 1. IAM : permissions puis rôles (les rôles dépendent des permissions) ──
      await this.permissionSeeder.seed();
      await this.roleSeeder.seed();

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

    this.logger.log(`✅ Seeding terminé pour cabinet #${cabinetId}`);
  }
}
