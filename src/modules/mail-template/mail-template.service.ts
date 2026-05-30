import { Repository } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Handlebars from 'handlebars';
import { MailTemplate } from './entities/mail-template.entity';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

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
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async create(dto: CreateMailTemplateDto): Promise<MailTemplate> {
    const existing = await this.repository.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`Un template avec le code "${dto.code}" existe déjà.`);
    }
    const tpl = this.repository.create({ ...dto, category: (dto.category as any) ?? 'general' });
    return this.repository.save(tpl);
  }

  async findAll(): Promise<MailTemplate[]> {
    return this.repository.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  async findActive(): Promise<MailTemplate[]> {
    return this.repository.find({ where: { is_active: true }, order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<MailTemplate> {
    const tpl = await this.repository.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`Template #${id} non trouvé`);
    return tpl;
  }

  async findByCode(code: string): Promise<MailTemplate | null> {
    return this.repository.findOne({ where: { code } });
  }

  async update(id: number, dto: UpdateMailTemplateDto): Promise<MailTemplate> {
    const tpl = await this.findOne(id);
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
  async render(code: string, context: Record<string, any> = {}): Promise<RenderedMail> {
    const tpl = await this.findByCode(code);
    if (!tpl) throw new NotFoundException(`Template "${code}" introuvable`);
    return this.renderTemplate(tpl, context);
  }

  async preview(id: number, context: Record<string, any> = {}): Promise<RenderedMail> {
    const tpl = await this.findOne(id);
    return this.renderTemplate(tpl, context);
  }

  private async renderTemplate(
    tpl: MailTemplate,
    context: Record<string, any>,
  ): Promise<RenderedMail> {
    const cabinet = await this.getCurrentCabinet();
    const brand = this.buildBrandContext(cabinet);
    const fullContext = { ...brand, ...context };

    const subject = Handlebars.compile(tpl.subject || '')(fullContext);
    const bodyHtml = Handlebars.compile(tpl.body_html || '')(fullContext);
    const html = this.wrapWithLayout(bodyHtml, brand);

    return { subject, html };
  }

  private async getCurrentCabinet(): Promise<Cabinet | null> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return null;
    return this.cabinetRepo.findOne({ where: { id: tenantId } });
  }

  private buildBrandContext(cabinet: Cabinet | null) {
    return {
      cabinetName: cabinet?.name ?? 'Votre cabinet',
      logoUrl: cabinet?.logo_url ?? null,
      brandColor: cabinet?.brand_color ?? '#1d4ed8',
      contactEmail: cabinet?.contact_email ?? null,
      contactPhone: cabinet?.contact_phone ?? null,
      address: cabinet?.address ?? null,
      website: cabinet?.website ?? null,
      emailFooter: cabinet?.email_footer ?? null,
      currentYear: new Date().getFullYear(),
    };
  }

  /** Habillage HTML : en-tête (logo/nom) + corps + pied de page (coordonnées). */
  private wrapWithLayout(body: string, brand: ReturnType<typeof this.buildBrandContext>): string {
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
