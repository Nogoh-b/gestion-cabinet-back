import { describe, expect, it } from '@jest/globals';
import { BUSINESS_METADATA_KEY } from 'src/core/decorators/business-metadata.decorator';
import {
  AI_TABLE_PERMISSIONS,
  AiDatabasePermissionService,
} from './ai-database-permission.service';
import { PERMISSION_DEFINITIONS } from 'src/core/auth/seeders/permission.seeder';
import { ROLES_CONFIG } from 'src/core/auth/seeders/role.seeder';
import { PdfTemplate } from 'src/modules/pdf-templates/entities/pdf-template.entity';
import { MailTemplate } from 'src/modules/mail-template/entities/mail-template.entity';
import { TemplateBlock } from 'src/modules/template-blocks/entities/template-block.entity';

/**
 * Modèles PDF / mails et blocs d'en-tête-pied de page pilotables depuis le
 * chat IA (lister, lire, créer, modifier), comme dans les pages de gestion :
 * - entités décorées @BusinessTable (schéma + écriture générique),
 * - droits IA miroirs des droits hors chat,
 * - codes de permission des modèles de mails semés et accordés aux rôles PDF.
 */
describe('Modèles et blocs pilotables par le chat IA', () => {
  const service = new AiDatabasePermissionService({} as any, {} as any);

  it('expose les trois tables avec les droits miroirs de la gestion hors chat', () => {
    expect(AI_TABLE_PERMISSIONS.pdf_templates).toEqual({
      READ: 'view_pdf_templates',
      INSERT: 'create_pdf_template',
      UPDATE: 'edit_pdf_template',
      DELETE: 'delete_pdf_template',
    });
    expect(AI_TABLE_PERMISSIONS.template_blocks).toEqual({
      READ: 'view_pdf_templates',
      INSERT: 'create_pdf_template',
      UPDATE: 'edit_pdf_template',
      DELETE: 'delete_pdf_template',
    });
    expect(AI_TABLE_PERMISSIONS.mail_templates).toEqual({
      READ: 'view_mail_templates',
      INSERT: 'create_mail_template',
      UPDATE: 'edit_mail_template',
      DELETE: 'delete_mail_template',
    });
  });

  it('autorise la lecture IA aux détenteurs des droits de visualisation', () => {
    expect(service.getReadPermission('pdf_templates')).toBe('view_pdf_templates');
    expect(service.getReadPermission('template_blocks')).toBe('view_pdf_templates');
    expect(service.getReadPermission('mail_templates')).toBe('view_mail_templates');
  });

  it('décrit les entités pour le schéma envoyé au modèle', () => {
    expect(Reflect.getMetadata(BUSINESS_METADATA_KEY, PdfTemplate)).toMatchObject({
      label: 'Modèles de documents PDF',
    });
    expect(Reflect.getMetadata(BUSINESS_METADATA_KEY, MailTemplate)).toMatchObject({
      label: 'Modèles de mails',
    });
    expect(Reflect.getMetadata(BUSINESS_METADATA_KEY, TemplateBlock)).toMatchObject({
      label: 'Blocs d’en-tête et pied de page',
    });
  });

  it('sème les codes de permission des modèles de mails et les accorde aux rôles PDF', () => {
    const codes = PERMISSION_DEFINITIONS.map((permission) => permission.code);
    for (const code of [
      'view_mail_templates',
      'create_mail_template',
      'edit_mail_template',
      'delete_mail_template',
    ]) {
      expect(codes).toContain(code);
    }
    const admin = ROLES_CONFIG.find((role) => role.code === 'admin');
    expect(admin).toBeDefined();
    for (const code of [
      'view_mail_templates',
      'create_mail_template',
      'edit_mail_template',
      'delete_mail_template',
    ]) {
      expect(admin!.permissions).toContain(code);
    }
  });
});
