/// <reference types="jest" />
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { ForbiddenException } from '@nestjs/common';
import * as vm from 'vm';
import { ZipArchive } from 'archiver';
import { DossierExportService, exportRights } from './dossier-export.service';
import type { ExportDossier, ExportManifest } from './export-format';
import { InvoiceLine, BillableItem, DossierBillingProfile, DossierBillingRule } from '../case-workflow/entities/billing.entity';
import { DossierAction, DossierActionDocumentLink } from '../case-workflow/entities/dossier-action.entity';
import { User } from '../iam/user/entities/user.entity';

// archiver est publié en ESM : remplacé par une archive factice.
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

const lawyer = {
  role: 'avocat',
  permissions: ['view_dossiers', 'view_billable_items', 'view_dossier_referrals'],
};
const accountant = {
  role: 'comptable',
  permissions: ['view_dossiers', 'view_factures', 'view_payroll'],
};
const admin = { id: 1, role: 'admin', permissions: [] };
const dossier = () => ({
  id: 7,
  tenant_id: 5,
  dossier_number: 'DOS-2026-0007',
  object: 'Recouvrement',
  budget_estimate: 500000,
  client_id: 83,
  client: { id: 83, full_name: 'SARL Kamga', private_key: 'priv-83', public_key: 'pub-83' },
  lawyer: { id: 31, full_name: 'Me Ndi', salary: 900000, hourly_rate: 40000 },
});

/**
 * Dépôt factice : applique un `where` simple (égalité, `In`, relation
 * imbriquée) comme la base, pour qu'un export de deux dossiers ne mélange pas
 * leurs lignes.
 */
function repo(rows: any[]) {
  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([key, expected]: [string, any]) => {
      if (expected && typeof expected === 'object' && '_type' in expected) {
        return expected._type === 'in'
          ? expected._value.map(String).includes(String(row?.[key]))
          : true;
      }
      if (expected && typeof expected === 'object') return matches(row?.[key] ?? {}, expected);
      return String(row?.[key]) === String(expected);
    });
  const find = jest.fn(async (options: any = {}) => rows.filter((r) => matches(r, options.where)));
  return { find, findOne: jest.fn(async (options: any) => (await find(options))[0] ?? null) };
}

const factureRows = () => [
  { id: 'f1', dossier_id: 7, numero: 'F-1', status: '2', type: 0, montantHT: '60000.00', tauxTVA: '0', montantTVA: '0', montantTTC: '60000.00', currency: 'XAF' },
  { id: 'f2', dossier_id: 7, numero: 'F-2', status: '5', type: 0, montantTTC: '20000.00' },
];
const paiementRows = () => [
  { id: 'p1', montant: '25000.00', status: '1', modePaiement: '2', reference: 'VIR-1', datePaiement: '2026-03-01', facture: { id: 'f1', numero: 'F-1' } },
  { id: 'p2', montant: '5000.00', status: '0', modePaiement: '0', datePaiement: '2026-03-05', facture: { id: 'f1', numero: 'F-1' } },
];

/** Service avec ses dépôts factices ; `db.getRepository` sert les entités du workflow. */
function makeService(over: { dossiers?: any[]; findOne?: jest.Mock } = {}) {
  const dossiers = over.dossiers ?? [dossier()];
  const dossierRepo = over.findOne ? { findOne: over.findOne } : repo(dossiers);
  const factureRepo = repo(factureRows());
  const paiementRepo = repo(paiementRows());
  const audienceRepo = repo([
    { id: 71, dossier_id: 7, type: 0, status: 1, audience_date: '2026-02-03', report_content: "Rapport de l'audience", decision_text: 'Renvoi au 10/03', documents: [{ id: 700 }], decision_documents: [], report_documents: [{ id: 700 }] },
  ]);
  const diligenceRepo = repo([
    { id: 5, dossier_id: 7, title: 'Conclusions', assigned_lawyer: { id: 31, full_name: 'Me Ndi', salary: 900000, password: '$2b$10$hash', refreshToken: 'rt' } },
  ]);
  const workflow = new Map<unknown, ReturnType<typeof repo>>([
    [InvoiceLine, repo([{ id: 'l1', facture_id: 'f1', label: 'Honoraires de plaidoirie', category: 'HONORARIUM', quantity: '1', unit_price: '60000', gross_amount: '60000', display_order: 0 }])],
    [DossierBillingProfile, repo([{ id: 'bp', dossier_id: 7, mode: 'FIXED', currency: 'XAF', vat_rate: '0', fixed_fee: '60000' }])],
    [DossierBillingRule, repo([])],
    [BillableItem, repo([{ id: 'b1', dossier_id: 7, label: 'Signature', category: 'HONORARIUM', status: 'INVOICED', gross_amount: '60000', currency: 'XAF', invoice_line_id: 'l1' }])],
    [DossierAction, repo([{ id: 'a1', dossier_id: 7, title: 'Faire signer', status: 'COMPLETED', priority: 'NORMAL', billing_decision: 'BILLABLE', responsible_user_id: 31 }])],
    [DossierActionDocumentLink, repo([{ id: 'dl', action_id: 'a1', document_id: 700, role: 'OUTPUT' }])],
    [User, repo([{ id: 31, full_name: 'Me Ndi' }])],
  ]);
  const db = {
    getRepository: (entity: unknown) => workflow.get(entity) ?? repo([]),
    query: jest.fn(async (sql: string) =>
      /FROM cabinets/.test(sql)
        ? [{ id: 5, code: 'CAB5', name: 'Cabinet Mbarga & Associés', address: 'Yaoundé', contact_email: 'contact@cab.cm', contact_phone: '+237 6', website: null, logo: null }]
        : [],
    ),
  };
  const sqlExporter = { export: jest.fn(async (scope: any) => `-- SQL ${scope.label}`) };
  // Copie serveur factice : le flux se termine quand l'archive factice s'achève.
  const store = {
    open: jest.fn((tenantId: number, name: string) => ({
      absPath: `/uploads/exports/${tenantId}/${name}`,
      relPath: `exports/${tenantId}/${name}`,
      stream: fakeFileStream(),
    })),
    sizeOf: jest.fn(() => 4096),
    discard: jest.fn(),
    record: jest.fn(async () => ({ id: 1 })),
  };
  const quota = { checkStorageLimit: jest.fn(async () => undefined) };
  const service = new DossierExportService(
    dossierRepo as any,
    repo([]) as any,
    factureRepo as any,
    paiementRepo as any,
    audienceRepo as any,
    diligenceRepo as any,
    repo([]) as any,
    db as any,
    sqlExporter as any,
    store as any,
    quota as any,
  );
  return { service, factureRepo, paiementRepo, sqlExporter, db, workflow, store, quota };
}

/** Flux d'écriture factice : émet `finish` dès que l'archive a fini de s'y écrire. */
function fakeFileStream() {
  const stream = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
  stream.destroy = jest.fn();
  return stream;
}

/** Réponse HTTP factice : `download` reçoit le chemin du ZIP envoyé. */
function fakeRes() {
  return { setHeader: jest.fn(), download: jest.fn() } as any;
}

/** Archive factice : nom → contenu (texte ou Buffer). */
function fakeArchive() {
  const files = new Map<string, any>();
  let piped: EventEmitter | undefined;
  return {
    files,
    on: jest.fn(),
    pipe: jest.fn((dest: EventEmitter) => {
      piped = dest;
    }),
    append: (content: any, { name }: { name: string }) => files.set(name, content),
    file: jest.fn(),
    // Le ZIP est entièrement écrit une fois l'archive finalisée.
    finalize: jest.fn(async () => {
      piped?.emit('finish');
    }),
  };
}

/** Exécute les scripts data/*.js comme le navigateur de la visionneuse. */
function loadViewerData(files: Map<string, any>) {
  const window: any = {};
  const scripts = [...files.keys()].filter((n) => n.startsWith('data/')).sort().reverse();
  for (const name of scripts) vm.runInNewContext(files.get(name), { window });
  return window.__EXPORT__ as { manifest: ExportManifest; dossiers: ExportDossier[] };
}

describe('DossierExportService archive', () => {
  function exportFor(user: object) {
    const ctx = makeService();
    const archive = fakeArchive();
    return (ctx.service as any)
      .addDossier(archive, 7, exportRights(user as any), {})
      .then(() => ({ ...ctx, files: archive.files }));
  }

  it('leaves invoices, payments and salaries out of a lawyer export', async () => {
    const { files, factureRepo } = await exportFor(lawyer);
    const names = [...files.keys()].map((name) => name.split('/').pop());

    expect(factureRepo.find).not.toHaveBeenCalled();
    expect(names).not.toEqual(expect.arrayContaining(['factures.csv']));
    expect(names).not.toEqual(expect.arrayContaining(['paiements.json']));
    expect([...files.keys()].some((n) => n.includes('/factures/'))).toBe(false);
    const summary = files.get('Dossier_DOS-2026-0007/resume.txt')!;
    expect(summary).not.toMatch(/Factures|Paiements|Solde/);
    expect(files.get('Dossier_DOS-2026-0007/diligences.json')).not.toContain('salary');
  });

  it('keeps the full archive for a user allowed to see invoices', async () => {
    const { files } = await exportFor(accountant);
    expect(files.has('Dossier_DOS-2026-0007/factures.csv')).toBe(true);
    expect(files.get('Dossier_DOS-2026-0007/resume.txt')).toContain('Solde restant');
  });

  // GET /exports/dossiers/90 : « Property "factureId" was not found in "Paiement" ».
  it('loads payments through the facture relation and totals validated ones only', async () => {
    const { files, paiementRepo } = await exportFor(accountant);
    const [options] = paiementRepo.find.mock.calls[0] as any[];
    expect(options.where.facture.id).toBeDefined();
    expect(options.where).not.toHaveProperty('factureId');

    const summary = files.get('Dossier_DOS-2026-0007/resume.txt')!;
    const amounts = summary.replace(/\s/g, ' ');
    expect(amounts).toMatch(/total hors annulées : 60 000,00/);
    expect(amounts).toMatch(/dont 1 annulée\(s\) : 20 000,00/);
    expect(amounts).toMatch(/encaissé validé : 25 000,00/);
    expect(amounts).toMatch(/Solde restant  : 35 000,00/);
    expect(summary).toMatch(/F-2 .*Annulée.*annulée, hors totaux/);
    expect(files.get('Dossier_DOS-2026-0007/paiements.csv')).toContain('Espèces');
  });

  it('renders one PDF per invoice with its payments', async () => {
    const { files } = await exportFor(accountant);
    const pdf: Buffer = files.get('Dossier_DOS-2026-0007/factures/F-1.pdf');

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(files.has('Dossier_DOS-2026-0007/factures/F-2.pdf')).toBe(true);
  });

  it('exports actions, billing and audience reports per right', async () => {
    const full = await exportFor(admin);
    expect(full.files.has('Dossier_DOS-2026-0007/actions.csv')).toBe(true);
    expect(full.files.has('Dossier_DOS-2026-0007/facturation.json')).toBe(true);
    expect(full.files.get('Dossier_DOS-2026-0007/resume.txt')).toMatch(/Rapport d'audience : Rapport de l'audience/);

    // Avocat : facturation (view_billable_items), ni actions ni factures.
    const { files, sqlExporter, workflow } = await exportFor(lawyer);
    expect(files.has('Dossier_DOS-2026-0007/actions.csv')).toBe(false);
    expect(workflow.get(DossierAction)!.find).not.toHaveBeenCalled();
    expect(files.has('Dossier_DOS-2026-0007/facturation.json')).toBe(true);
    expect(sqlExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5, dossierIds: [7], include: { invoices: false, billing: true, actions: false } }),
    );
    const data = loadViewerData(files).dossiers[0];
    expect(data.access).toEqual({ invoices: false, billing: true, actions: false });
    expect(data.invoices).toBeNull();
    expect(data.invoice_totals).toBeNull();
    expect(data.actions).toBeNull();
    expect(data.billing!.items[0].label).toBe('Signature');
    expect(JSON.stringify(data)).not.toMatch(/budget_estimate|salary/);
  });

  it('never writes passwords, tokens or client keys', async () => {
    const { files } = await exportFor(admin);
    for (const [name, content] of files) {
      if (Buffer.isBuffer(content)) continue;
      expect([name, content]).not.toEqual([name, expect.stringMatching(/\$2b\$10|refreshToken|priv-83|pub-83/)]);
    }
  });
});

describe('DossierExportService two-dossier ZIP', () => {

  it('writes PDFs, one SQL script per dossier and the viewer data', async () => {
    const second = { ...dossier(), id: 8, dossier_number: 'DOS-2026-0008', object: 'Bail commercial' };
    const { service, sqlExporter } = makeService({ dossiers: [dossier(), second] });
    const archive = fakeArchive();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => archive);

    await service.streamZip(fakeRes(), [7, 8], admin as any);
    const names = [...archive.files.keys()];

    expect(names).toEqual(
      expect.arrayContaining([
        'data/index.js',
        'data/dossier-7.js',
        'data/dossier-8.js',
        'database/dossier-DOS-2026-0007.sql',
        'database/dossier-DOS-2026-0008.sql',
        'Dossier_DOS-2026-0007/factures/F-1.pdf',
      ]),
    );
    expect(sqlExporter.export).toHaveBeenCalledTimes(2);
    expect(sqlExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5, dossierIds: [8], include: { invoices: true, billing: true, actions: true } }),
    );

    const { manifest, dossiers } = loadViewerData(archive.files);
    expect(manifest.format_version).toBe(1);
    expect(manifest.cabinet).toEqual(expect.objectContaining({ id: 5, name: 'Cabinet Mbarga & Associés' }));
    expect(manifest.cabinet).not.toHaveProperty('logo');
    expect(manifest.dossiers.map((d) => [d.id, d.data, d.sql, d.folder])).toEqual([
      [7, 'data/dossier-7.js', 'database/dossier-DOS-2026-0007.sql', 'Dossier_DOS-2026-0007'],
      [8, 'data/dossier-8.js', 'database/dossier-DOS-2026-0008.sql', 'Dossier_DOS-2026-0008'],
    ]);
    expect(dossiers.map((d) => d.id).sort()).toEqual([7, 8]);

    const d7 = dossiers.find((d) => d.id === 7)!;
    expect(d7.dossier.client).toEqual(expect.objectContaining({ id: 83, full_name: 'SARL Kamga' }));
    expect(d7.dossier.lawyer).toEqual({ id: 31, full_name: 'Me Ndi' });
    const f1 = d7.invoices!.find((f) => f.numero === 'F-1')!;
    expect(f1).toEqual(expect.objectContaining({ paid: 25000, remaining: 35000, pdf: 'Dossier_DOS-2026-0007/factures/F-1.pdf' }));
    expect(f1.payments.map((p) => [p.amount, p.validated, p.mode_label])).toEqual([
      [25000, true, 'Espèces'],
      [5000, false, 'Virement'],
    ]);
    expect(f1.lines[0]).toEqual(expect.objectContaining({ label: 'Honoraires de plaidoirie', gross_amount: 60000 }));
    expect(d7.invoice_totals).toEqual(expect.objectContaining({ total: 60000, paid: 25000, remaining: 35000 }));
    expect(d7.actions![0]).toEqual(
      expect.objectContaining({ title: 'Faire signer', status_label: 'Terminée', responsible: { id: 31, full_name: 'Me Ndi' }, documents: [{ document_id: 700, role: 'OUTPUT' }] }),
    );
    expect(d7.audiences[0]).toEqual(
      expect.objectContaining({ report_content: "Rapport de l'audience", decision_text: 'Renvoi au 10/03', report_document_ids: [700] }),
    );
    expect(d7.billing!.profile).toEqual(expect.objectContaining({ mode: 'FIXED', fixed_fee: 60000 }));
  });

  it('puts the offline viewer at the root of the ZIP', async () => {
    const { service } = makeService();
    const archive = fakeArchive();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => archive);

    await service.streamZip(fakeRes(), [7], admin as any);

    for (const name of ['index.html', 'app.js', 'style.css']) {
      expect(archive.files.get(name)?.length).toBeGreaterThan(0);
    }
    expect(archive.files.get('index.html').toString()).toContain('<script src="data/index.js">');
  });

  it('leaves the viewer out of the README-only ZIP', async () => {
    const { service } = makeService({ dossiers: [] });
    const archive = fakeArchive();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => archive);

    await service.streamZip(fakeRes(), [7], admin as any);

    expect([...archive.files.keys()]).toEqual(['README.txt']);
  });
});

/** La visionneuse doit rester 100 % hors-ligne et n'insérer aucune donnée brute dans le DOM. */
describe('offline viewer template', () => {
  const read = (name: string) => fs.readFileSync(`${__dirname}/viewer/${name}`, 'utf8');

  it.each(['index.html', 'app.js', 'style.css'])('%s loads nothing from the network', (name) => {
    expect(read(name)).not.toMatch(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(read(name)).not.toMatch(/@import|fetch\(|XMLHttpRequest|sendBeacon/);
  });

  it('never writes data as HTML', () => {
    expect(read('app.js')).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/);
  });
});

/**
 * GET /exports/dossiers : même portée que la liste des dossiers — un avocat
 * n'exporte que les dossiers dont il est l'avocat responsable, même en
 * devinant l'identifiant d'un dossier d'un confrère.
 */
describe('DossierExportService role scope', () => {
  // Dossier 7 : Me Ndi (31) ; dossier 8 : un confrère (40).
  const rows = [
    { id: 7, dossier_number: 'DOS-2026-0007', lawyer_id: 31, client_id: 83 },
    { id: 8, dossier_number: 'DOS-2026-0008', lawyer_id: 40, client_id: 84 },
  ];
  /** Applique le `where` comme la base : identifiant + portée du rôle. */
  const findOne = jest.fn(
    async ({ where }: any) =>
      rows.find(
        (row) =>
          row.id === where.id &&
          (where.lawyer === undefined || where.lawyer.id === row.lawyer_id) &&
          (where.client_id === undefined || where.client_id === row.client_id),
      ) ?? null,
  );


  /** Dossiers de l'archive produite (un par export), ou README.txt. */
  async function exportRoots(ids: number[], user: object): Promise<string[]> {
    const archive = fakeArchive();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => archive);
    const { service } = makeService({ findOne });
    findOne.mockClear();

    await service.streamZip(fakeRes(), ids, user as any);
    const roots = [...new Set([...archive.files.keys()].map((name) => name.split('/')[0]))];
    // data/ et database/ accompagnent tout export non vide.
    if (roots.some((r) => r.startsWith('Dossier_'))) {
      expect(roots).toEqual(expect.arrayContaining(['data', 'database', 'index.html', 'app.js', 'style.css']));
    }
    return roots.filter((r) => r.startsWith('Dossier_') || r === 'README.txt');
  }

  it("leaves a colleague's dossier out of a lawyer export", async () => {
    const user = { id: 31, ...lawyer };

    expect(await exportRoots([7, 8], user)).toEqual(['Dossier_DOS-2026-0007']);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8, lawyer: { id: 31 } } }),
    );
  });

  it('applies the scope to a cabinet role based on the lawyer role', async () => {
    const user = { id: 31, role: 'avocat_associe', base_role: 'avocat', permissions: ['view_dossiers'] };

    expect(await exportRoots([7, 8], user)).toEqual(['Dossier_DOS-2026-0007']);
  });

  it('answers with the README when no requested dossier is in scope', async () => {
    const user = { id: 31, ...lawyer };

    expect(await exportRoots([8], user)).toEqual(['README.txt']);
  });

  it('keeps every requested dossier in an admin export', async () => {
    expect(await exportRoots([7, 8], admin)).toEqual([
      'Dossier_DOS-2026-0007',
      'Dossier_DOS-2026-0008',
    ]);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8 } }),
    );
  });
});

describe('DossierExportService server copy and quota', () => {
  function run(over: { quotaFails?: 'estimate' | 'size'; dossiers?: any[] } = {}) {
    const ctx = makeService({ dossiers: over.dossiers });
    const archive = fakeArchive();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => archive);
    let calls = 0;
    ctx.quota.checkStorageLimit.mockImplementation(async () => {
      calls += 1;
      if (over.quotaFails && calls === (over.quotaFails === 'estimate' ? 1 : 2)) {
        throw new ForbiddenException('Espace de stockage insuffisant');
      }
    });
    const res = fakeRes();
    return { ...ctx, archive, res, send: () => ctx.service.streamZip(res, [7], admin as any) };
  }

  it('keeps the ZIP under the tenant folder, records it and sends it', async () => {
    const { send, store, quota, res } = run();

    await send();

    const [tenantId, name] = store.open.mock.calls[0] as unknown as [number, string];
    expect(name).toMatch(/^[0-9a-f]{8}_dossier-7_.*\.zip$/);
    expect(quota.checkStorageLimit).toHaveBeenLastCalledWith(tenantId, 4096);
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        dossierIds: [7],
        fileSize: 4096,
        relPath: expect.stringMatching(new RegExp(`^exports/${tenantId}/`)),
        fileName: expect.stringMatching(/^dossier-7_.*\.zip$/),
      }),
    );
    expect(res.download).toHaveBeenCalledWith(expect.stringContaining('dossier-7_'), expect.stringMatching(/^dossier-7_/), expect.any(Function));
    expect(store.discard).not.toHaveBeenCalled();
  });

  it('refuses before building anything when the estimate does not fit', async () => {
    const { send, store, archive, res } = run({ quotaFails: 'estimate' });

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);

    expect(store.open).not.toHaveBeenCalled();
    expect(archive.files.size).toBe(0);
    expect(res.download).not.toHaveBeenCalled();
  });

  it('deletes the file and answers 403 when the real size exceeds the quota', async () => {
    const { send, store, res } = run({ quotaFails: 'size' });

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);

    expect(store.discard).toHaveBeenCalledWith(expect.stringContaining('dossier-7_'));
    expect(store.record).not.toHaveBeenCalled();
    expect(res.download).not.toHaveBeenCalled();
  });

  it('does not keep or record a README-only ZIP', async () => {
    const { send, store, res } = run({ dossiers: [] });

    await send();
    const done = res.download.mock.calls[0][2] as (err?: Error) => void;
    done();

    expect(store.record).not.toHaveBeenCalled();
    expect(store.discard).toHaveBeenCalled();
  });
});
