/// <reference types="jest" />
import { PdfTemplatesService } from 'src/modules/pdf-templates/pdf-templates.service';
import { TemplateBlocksService } from 'src/modules/template-blocks/template-blocks.service';
import { TenantContext } from './tenant.context';
import { ownCopyOf, preferOwnByCode } from './shared-rows';

const tenant = new TenantContext();

const globalRow = { id: 3, tenant_id: 1, code: 'audience_convocation', name: 'Audience — Avis au client', is_system: true, title: 'AVIS' };
const ownRow = { id: 40, tenant_id: 22, code: 'audience_convocation', name: 'Audience — Avis au client', is_system: true, title: 'AVIS' };

describe('preferOwnByCode', () => {
  it('garde la copie du cabinet quand le modèle global existe aussi', () => {
    tenant.run(22, () => {
      expect(preferOwnByCode([globalRow, ownRow])).toEqual([ownRow]);
      expect(preferOwnByCode([ownRow, globalRow])).toEqual([ownRow]);
    });
  });

  it('garde le global tant que le cabinet n’a pas de copie', () => {
    tenant.run(22, () => expect(preferOwnByCode([globalRow])).toEqual([globalRow]));
  });
});

describe('ownCopyOf', () => {
  it('redirige vers la copie du cabinet au lieu de déplacer la ligne globale', async () => {
    await tenant.run(22, async () => {
      const result = await ownCopyOf(globalRow, async () => ownRow, (copy) => copy as any);
      expect(result).toBe(ownRow);
    });
  });

  it('crée une copie sans identifiant quand le cabinet n’en a pas', async () => {
    await tenant.run(22, async () => {
      const result: any = await ownCopyOf(globalRow, async () => null, (copy) => copy as any);
      expect(result.id).toBeUndefined();
      expect(result.tenant_id).toBeUndefined();
      expect(result.code).toBe('audience_convocation');
    });
  });
});

describe('PdfTemplatesService.update — modèle système global', () => {
  it('« Duplicate entry 22-audience_convocation » : la copie du cabinet est modifiée, la ligne globale intacte', async () => {
    const saved: any[] = [];
    const repository: any = {
      findOne: jest.fn(async ({ where }: any) => [globalRow, ownRow].find((row) => row.id === where.id) ?? null),
      find: jest.fn(async ({ where }: any) => [globalRow, ownRow].filter((row) => row.code === where.code)),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => { saved.push(value); return value; }),
    };
    const service = new PdfTemplatesService({} as any, repository);
    await tenant.run(22, async () => {
      const result = await service.update(globalRow.id, { title: 'AVIS D’AUDIENCE' } as any);
      expect(result).toBe(ownRow);
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(40);
    expect(globalRow.title).toBe('AVIS');
  });

  it('sans copie du cabinet, une copie est créée (pas de déplacement de la ligne globale)', async () => {
    const repository: any = {
      findOne: jest.fn(async () => ({ ...globalRow })),
      find: jest.fn(async () => [globalRow]),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };
    const service = new PdfTemplatesService({} as any, repository);
    await tenant.run(22, async () => {
      const result: any = await service.update(globalRow.id, { title: 'Nouveau' } as any);
      expect(result.id).toBeUndefined();
      expect(result.title).toBe('Nouveau');
    });
  });
});

describe('TemplateBlocksService.update — bloc global', () => {
  it('modifie la copie du cabinet', async () => {
    const block = { id: 10, tenant_id: 1, code: 'pdf_header_defaut', name: 'En-tête', is_system: true, is_default: false, channel: 'pdf', kind: 'header' };
    const own = { ...block, id: 50, tenant_id: 22 };
    const saved: any[] = [];
    const repository: any = {
      findOne: jest.fn(async () => block),
      find: jest.fn(async () => [block, own]),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => { saved.push(value); return value; }),
      update: jest.fn(),
    };
    const service = new TemplateBlocksService(repository);
    await tenant.run(22, () => service.update(10, { name: 'Autre' } as any));
    expect(saved[0].id).toBe(50);
  });
});
