import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { TemplateBlock } from '../entities/template-block.entity';

/**
 * Seed des blocs en-tête / pied de page par défaut (système).
 *
 * Quatre blocs « par défaut », un par couple (canal, nature) :
 *  - pdf  / header   - pdf  / footer
 *  - mail / header   - mail / footer
 *
 * Les modèles (PDF & mail) qui ne référencent aucun bloc explicitement
 * retombent sur le bloc `is_default` de leur canal. Les blocs sont éditables
 * depuis l'interface « Modèles » ; le HTML utilise les variables `{{cabinet.*}}`
 * (et `{{page.*}}` pour le PDF) interpolées au moment du rendu côté front.
 */

/* ── PDF ──────────────────────────────────────────────────────────────── */

const PDF_HEADER = `
<div style="padding-bottom:8px; margin-bottom:10px; border-bottom-width:2px; border-bottom-color:#1e3a8a; border-bottom-style:solid;">
  <div style="font-size:16px; font-weight:bold; color:#1e3a8a;">{{cabinet.name}}</div>
  <div style="font-size:9px; color:#64748b;">{{cabinet.slogan}}</div>
  <div style="font-size:8px; color:#475569; margin-top:4px;">{{cabinet.address}} · {{cabinet.phone}} · {{cabinet.email}}</div>
</div>`.trim();

const PDF_FOOTER = `
<div style="padding-top:6px; margin-top:10px; border-top-width:1px; border-top-color:#cbd5e1; border-top-style:solid; font-size:7px; color:#94a3b8; text-align:center;">
  <div>{{cabinet.name}} · {{cabinet.email}} · {{cabinet.phone}}</div>
  <div>{{cabinet.rccm}}</div>
</div>`.trim();

/* ── MAIL ─────────────────────────────────────────────────────────────── */

const MAIL_HEADER = `
<div style="background:#1d4ed8; color:#ffffff; padding:20px 24px;">
  <div style="font-size:20px; font-weight:bold;">{{cabinet.name}}</div>
  <div style="font-size:13px; opacity:0.85;">{{cabinet.slogan}}</div>
</div>`.trim();

const MAIL_FOOTER = `
<div style="background:#f1f5f9; color:#64748b; padding:16px 24px; font-size:12px; text-align:center;">
  <div>{{cabinet.name}} — {{cabinet.address}}</div>
  <div>{{cabinet.email}} · {{cabinet.phone}} · {{cabinet.website}}</div>
  <div style="margin-top:6px; font-size:11px;">{{cabinet.rccm}}</div>
  <div style="margin-top:6px; font-size:11px;">© {{year}} {{cabinet.name}}. Tous droits réservés.</div>
</div>`.trim();

const BLOCK_VARS = JSON.stringify([
  'cabinet.name',
  'cabinet.slogan',
  'cabinet.address',
  'cabinet.phone',
  'cabinet.email',
  'cabinet.website',
  'cabinet.rccm',
  'cabinet.nina',
  'year',
]);

export default class TemplateBlockSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(TemplateBlock);

    const blocks: Partial<TemplateBlock>[] = [
      {
        code: 'pdf_header_defaut',
        name: 'En-tête PDF par défaut',
        channel: 'pdf',
        kind: 'header',
        description: "En-tête PDF : nom du cabinet, slogan et coordonnées.",
        body_html: PDF_HEADER,
        is_default: true,
        is_system: true,
        is_active: true,
      },
      {
        code: 'pdf_footer_defaut',
        name: 'Pied de page PDF par défaut',
        channel: 'pdf',
        kind: 'footer',
        description: 'Pied de page PDF : coordonnées et mentions légales.',
        body_html: PDF_FOOTER,
        is_default: true,
        is_system: true,
        is_active: true,
      },
      {
        code: 'mail_header_defaut',
        name: 'En-tête mail par défaut',
        channel: 'mail',
        kind: 'header',
        description: 'Bandeau mail coloré avec nom du cabinet et slogan.',
        body_html: MAIL_HEADER,
        is_default: true,
        is_system: true,
        is_active: true,
      },
      {
        code: 'mail_footer_defaut',
        name: 'Pied de page mail par défaut',
        channel: 'mail',
        kind: 'footer',
        description: 'Pied de page mail : coordonnées, mentions et copyright.',
        body_html: MAIL_FOOTER,
        is_default: true,
        is_system: true,
        is_active: true,
      },
    ];

    for (const data of blocks) {
      const existing = await repository.findOne({ where: { code: data.code } });
      if (!existing) {
        await repository.save(repository.create({ ...data, variables: BLOCK_VARS } as any));
        console.log(`Bloc de modèle créé : ${data.name} (${data.code})`);
      } else {
        console.log(`Bloc de modèle déjà existant, ignoré : ${data.code}`);
      }
    }
  }
}
