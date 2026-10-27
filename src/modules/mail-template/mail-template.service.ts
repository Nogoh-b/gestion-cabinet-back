import { Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Handlebars from 'handlebars';
import { MailTemplate } from './entities/mail-template.entity';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';
import {
  Cabinet,
  cabinetLogoToDataUri,
} from 'src/modules/cabinet/entities/cabinet.entity';
import { logoFileToUrl } from 'src/modules/cabinet/cabinet-logo.util';
import { getCurrentTenantId, hasActiveTenant } from 'src/core/tenant/tenant.context';
import { hoistLoops, TEMPLATE_LIST_REFERENCE } from './template-context';
import { TemplateContextService } from './template-context.service';

export interface RenderedMail {
  subject: string;
  html: string;
}

@Injectable()
export class MailTemplateService {
  constructor(
    @InjectRepository(MailTemplate)
    private readonly repository: Repository<MailTemplate>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    @Optional() private readonly templateContext?: TemplateContextService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async create(dto: CreateMailTemplateDto): Promise<MailTemplate> {
    const existing = await this.repository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Un template avec le code "${dto.code}" existe déjà.`,
      );
    }
    const tpl = this.repository.create({
      ...dto,
      category: (dto.category as any) ?? 'general',
      audience: (dto.audience as any) ?? 'both',
    });
    return this.repository.save(tpl);
  }

  /**
   * Les modèles sont partagés (@SharedAcrossTenants) : un cabinet lit ceux du
   * référentiel global (tenant 1) en plus des siens, et chaque cabinet reçoit
   * une copie des modèles globaux à sa création. Pour un même code, la copie
   * du cabinet l'emporte : sans cela la liste montre chaque modèle en double
   * et un code peut désigner le modèle global.
   */
  private preferOwn(rows: MailTemplate[]): MailTemplate[] {
    if (!hasActiveTenant()) return rows;
    const tenantId = getCurrentTenantId();
    const byCode = new Map<string, MailTemplate>();
    for (const row of rows) {
      const kept = byCode.get(row.code);
      if (!kept || (kept.tenant_id !== tenantId && row.tenant_id === tenantId)) {
        byCode.set(row.code, row);
      }
    }
    return rows.filter((row) => byCode.get(row.code) === row);
  }

  async findAll(): Promise<MailTemplate[]> {
    return this.preferOwn(
      await this.repository.find({ order: { category: 'ASC', name: 'ASC' } }),
    );
  }

  async findActive(): Promise<MailTemplate[]> {
    return this.preferOwn(
      await this.repository.find({
        where: { is_active: true },
        order: { name: 'ASC' },
      }),
    );
  }

  async findOne(id: number): Promise<MailTemplate> {
    const tpl = await this.repository.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`Template #${id} non trouvé`);
    return tpl;
  }

  async findByCode(code: string): Promise<MailTemplate | null> {
    const [tpl] = this.preferOwn(await this.repository.find({ where: { code } }));
    return tpl ?? null;
  }

  async update(id: number, dto: UpdateMailTemplateDto): Promise<MailTemplate> {
    let tpl = await this.findOne(id);
    // Modèle global vu par un cabinet : on modifie la copie du cabinet (créée
    // au besoin), jamais le référentiel. `save` réécrit tenant_id avec le
    // cabinet courant et déplacerait sinon la ligne globale dans le cabinet.
    if (hasActiveTenant() && tpl.tenant_id !== getCurrentTenantId()) {
      const own = await this.findByCode(tpl.code);
      if (own && own.tenant_id === getCurrentTenantId()) {
        tpl = own;
      } else {
        const { id: _id, tenant_id: _tenant, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...copy } = tpl as any;
        tpl = this.repository.create(copy as Partial<MailTemplate>);
      }
    }
    Object.assign(tpl, dto);
    return this.repository.save(tpl);
  }

  async remove(id: number): Promise<void> {
    const tpl = await this.findOne(id);
    if (tpl.is_system) {
      throw new BadRequestException(
        'Ce template système ne peut pas être supprimé. Vous pouvez seulement le modifier.',
      );
    }
    await this.repository.delete(id);
  }

  // ── Rendu avec branding cabinet ──────────────────────────────────────────

  /**
   * Compile un template (par code) avec le contexte fourni et l'habillage
   * (en-tête + pied de page) construit à partir des informations du cabinet
   * courant (logo, couleur, coordonnées).
   */
  async render(
    code: string,
    context: Record<string, any> = {},
  ): Promise<RenderedMail> {
    const tpl = await this.findByCode(code);
    if (!tpl || !tpl.is_active) throw new NotFoundException(`Template "${code}" indisponible`);
    return this.renderTemplate(tpl, context);
  }

  async renderOrCreateSystemDefault(
    code: string,
    context: Record<string, any> = {},
  ): Promise<RenderedMail> {
    // Defaults are copied from the published profile at cabinet creation.
    // A missing template may have been intentionally retired.
    return this.render(code, context);
  }

  async preview(
    id: number,
    context: Record<string, any> = {},
  ): Promise<RenderedMail> {
    const tpl = await this.findOne(id);
    return this.renderTemplate(tpl, context);
  }

  private async renderTemplate(
    tpl: MailTemplate,
    context: Record<string, any>,
  ): Promise<RenderedMail> {
    const cabinet = await this.getCurrentCabinet();
    const brand = this.buildBrandContext(cabinet);
    // Listes et totaux (`{{#each dossier.factures}}`…) : chargés seulement si le modèle s'en sert.
    const usesLists = TEMPLATE_LIST_REFERENCE.test(`${tpl.subject ?? ''} ${tpl.body_html ?? ''}`);
    const enriched = usesLists && this.templateContext ? await this.templateContext.enrichMailContext(context) : context;
    const fullContext = { ...brand, ...enriched };

    const subject = Handlebars.compile(tpl.subject || '')(fullContext);
    const bodyHtml = Handlebars.compile(hoistLoops(tpl.body_html || ''))(fullContext);
    const html = this.wrapWithLayout(bodyHtml, brand);

    return { subject, html };
  }

  /**
   * Corps HTML rédigé hors modèle (compétence « Envoyer un e-mail » du chat)
   * habillé comme les modèles : en-tête et pied de page du cabinet courant.
   */
  async wrapForCabinet(bodyHtml: string): Promise<string> {
    const brand = this.buildBrandContext(await this.getCurrentCabinet());
    return this.wrapWithLayout(bodyHtml, brand);
  }

  private async getCurrentCabinet(): Promise<Cabinet | null> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return null;
    return this.cabinetRepo.findOne({ where: { id: tenantId } });
  }

  private buildBrandContext(cabinet: Cabinet | null) {
    const cabinetName = cabinet?.name ?? 'Votre cabinet';
    const contactEmail = cabinet?.contact_email ?? null;
    const contactPhone = cabinet?.contact_phone ?? null;
    const address = cabinet?.address ?? null;
    const website = cabinet?.website ?? null;
    return {
      cabinet: {
        nom: cabinetName,
        email: contactEmail ?? '',
        telephone: contactPhone ?? '',
        adresse: address ?? '',
        site_web: website ?? '',
      },
      cabinetName,
      // URL hébergée en priorité (affichable en e-mail), repli data-URI.
      logoUrl:
        logoFileToUrl(cabinet?.logo_file) ??
        cabinetLogoToDataUri(cabinet?.logo, cabinet?.logo_mime),
      brandColor: cabinet?.brand_color ?? '#1d4ed8',
      contactEmail,
      contactPhone,
      address,
      website,
      emailFooter: cabinet?.email_footer ?? null,
      currentYear: new Date().getFullYear(),
    };
  }

  /** Habillage HTML : en-tête (logo/nom) + corps + pied de page (coordonnées). */
  private wrapWithLayout(
    body: string,
    brand: ReturnType<typeof this.buildBrandContext>,
  ): string {
    const header = `
      <div style="background:${brand.brandColor};padding:24px;text-align:center;">
        ${
          brand.logoUrl
            ? `<img src="${brand.logoUrl}" alt="${brand.cabinetName}" style="max-height:48px;" />`
            : `<span style="color:#fff;font-size:20px;font-weight:700;">${brand.cabinetName}</span>`
        }
      </div>`;

    const footerLines = [
      brand.cabinetName,
      brand.address,
      [brand.contactPhone, brand.contactEmail].filter(Boolean).join(' · '),
      brand.website,
      brand.emailFooter,
    ].filter(Boolean);

    const footer = `
      <div style="padding:20px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
        ${footerLines.map((l) => `<div>${l}</div>`).join('')}
        <div style="margin-top:8px;">© ${brand.currentYear} ${brand.cabinetName}. Tous droits réservés.</div>
      </div>`;

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${header}
        <div style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">${body}</div>
        ${footer}
      </div>`;
  }
}
