import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { EmployeeWriteHandler } from 'src/modules/agencies/employee/employee-write.handler';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { GenericWriteService } from './generic-write.service';

class Note {}

/**
 * Base en mémoire : `createEmployeeDeferringCredentials` y écrit le User, son profil d'accès et
 * la fiche, comme le service RH ; le manager de transaction y applique
 * `update` / `softDelete` sur les lignes non supprimées.
 */
function createDb() {
  const db = {
    user: [] as any[],
    user_role_assignment: [] as any[],
    employee: [] as any[],
  };
  const tables = new Map<any, any[]>([
    [User, db.user],
    [UserRoleAssignment, db.user_role_assignment],
    [Employee, db.employee],
  ]);
  const matching = (target: any, criteria: any) =>
    tables
      .get(target)!
      .filter(
        (row) =>
          row.deleted_at === null &&
          (typeof criteria === 'object'
            ? Object.entries(criteria).every(([k, v]) => row[k] === v)
            : row.id === criteria),
      );
  const manager = {
    update: jest.fn(async (target: any, criteria: any, values: any) => {
      for (const row of matching(target, criteria)) Object.assign(row, values);
    }),
    softDelete: jest.fn(async (target: any, criteria: any) => {
      for (const row of matching(target, criteria)) row.deleted_at = new Date();
    }),
  };
  const addEmployee = (id: number, email: string | null) => {
    const user = { id, full_name: 'Jean Dupont', email, username: email ?? 'jean.dupont', status: 1, deleted_at: null };
    db.user.push(user);
    db.user_role_assignment.push({ user_id: id, role_id: 5, status: 1, deleted_at: null });
    const employee = { id, user, status: 'active', deleted_at: null };
    db.employee.push(employee);
    return employee;
  };
  const activeUsers = () => db.user.filter((u) => u.status === 1 && u.deleted_at === null);
  return { db, manager, addEmployee, activeUsers };
}

function createEmployeeHandler(store: ReturnType<typeof createDb>) {
  // Boîte d'envoi : `sendCredentials` y dépose l'email du collaborateur, comme
  // le service RH qui envoie le mot de passe temporaire.
  const sentEmails: string[] = [];
  const sendCredentials = jest.fn(async () => {
    const user = store.db.user[store.db.user.length - 1];
    if (user?.email) sentEmails.push(user.email);
  });
  const employeeService = {
    createEmployeeDeferringCredentials: jest.fn(async (dto: any) => ({
      employee: store.addEmployee(412, dto.email ?? null),
      sendCredentials,
    })),
  };
  const employeeRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      store.db.employee.find((e) => e.deleted_at === null && e.user.email === where.user.email) ?? null,
    ),
  };
  const handler = Object.create(EmployeeWriteHandler.prototype) as EmployeeWriteHandler;
  const props: Record<string, unknown> = {
    entityName: 'employee',
    entityMeta: { columns: [] },
    fkMap: new Map(),
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    dataSource: { transaction: jest.fn(async (work: any) => work(store.manager)) },
    employeeService,
    employeeRepo,
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(handler, key, { value });
  }
  return { handler, employeeService, sendCredentials, sentEmails };
}

function createService(handlers: Record<string, any>, entityMetadatas: any[] = []) {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { softDelete: jest.fn(), delete: jest.fn() },
  };
  const dataSource: any = { entityMetadatas, createQueryRunner: jest.fn(() => runner) };
  const registry: any = { getHandler: (name: string) => handlers[name] };
  return { service: new GenericWriteService(dataSource, registry), runner };
}

const failingDossierHandler = () => ({
  entityName: 'dossier',
  execute: jest.fn(async () => {
    throw new BadRequestException('Client introuvable');
  }),
});

const plan = (first: any) => ({
  transaction: true,
  confidence: 1,
  humanReadable: '',
  operations: [
    { humanReadable: '', ...first },
    { operation: 'INSERT', entity: 'dossier', fields: { title: 'Contentieux' }, humanReadable: '' },
  ],
});

describe('Annulation des créations d’un plan IA qui échoue', () => {
  it('[INSERT employee, opération en échec] ne laisse aucun compte User actif', async () => {
    const store = createDb();
    const { handler, employeeService } = createEmployeeHandler(store);
    const { service, runner } = createService({ employee: handler, dossier: failingDossierHandler() });

    await expect(
      service.executePlan(
        plan({ operation: 'INSERT', entity: 'employee', tempId: 'emp', fields: { full_name: 'Jean Dupont', email: 'jean.dupont@cabinet.com' } }) as any,
        '7',
      ),
    ).rejects.toThrow('Échec du plan d\'écriture: Client introuvable');

    expect(employeeService.createEmployeeDeferringCredentials).toHaveBeenCalledTimes(1);
    expect(store.activeUsers()).toEqual([]);
    expect(store.db.user[0]).toMatchObject({ id: 412, status: 0 });
    expect(store.db.user[0].deleted_at).toBeInstanceOf(Date);
    expect(store.db.user_role_assignment[0]).toMatchObject({ user_id: 412, status: 0 });
    expect(store.db.user_role_assignment[0].deleted_at).toBeInstanceOf(Date);
    expect(store.db.employee[0].deleted_at).toBeInstanceOf(Date);
    // Le hook remplace la suppression générique de la seule ligne employee.
    expect(runner.manager.softDelete).not.toHaveBeenCalled();
  });

  it('ne désactive jamais un collaborateur existant renvoyé comme doublon (affected 0)', async () => {
    const store = createDb();
    store.addEmployee(30, 'jean.dupont@cabinet.com');
    const { handler, employeeService } = createEmployeeHandler(store);
    const { service } = createService({ employee: handler, dossier: failingDossierHandler() });

    await expect(
      service.executePlan(
        plan({ operation: 'INSERT', entity: 'employee', fields: { full_name: 'Jean Dupont', email: 'jean.dupont@cabinet.com' } }) as any,
        '7',
      ),
    ).rejects.toThrow('Client introuvable');

    expect(employeeService.createEmployeeDeferringCredentials).not.toHaveBeenCalled();
    expect(store.activeUsers().map((u) => u.id)).toEqual([30]);
    expect(store.db.employee[0].deleted_at).toBeNull();
    expect(store.manager.softDelete).not.toHaveBeenCalled();
  });

  it('n’annule pas un UPDATE fait par un handler', async () => {
    const updater = {
      entityName: 'employee',
      execute: jest.fn(async () => ({
        success: true,
        operation: 'UPDATE',
        entityId: 30,
        affected: 1,
        data: { id: 30 },
        message: 'Collaborateur 30 mis à jour',
      })),
      rollbackInsert: jest.fn(async () => undefined),
    };
    const { service, runner } = createService({ employee: updater, dossier: failingDossierHandler() });

    await expect(
      service.executePlan(
        plan({ operation: 'UPDATE', entity: 'employee', entityId: 30, fields: { hourly_rate: 150 } }) as any,
        '7',
      ),
    ).rejects.toThrow('Client introuvable');

    expect(updater.rollbackInsert).not.toHaveBeenCalled();
    expect(runner.manager.softDelete).not.toHaveBeenCalled();
  });

  const noteHandler = () => ({
    entityName: 'note',
    execute: jest.fn(async () => ({
      success: true,
      operation: 'INSERT',
      entityId: 9,
      affected: 1,
      data: { id: 9 },
      message: 'Note créée',
    })),
  });

  it('supprime définitivement la ligne créée par le plan (rien en corbeille, valeurs uniques libérées)', async () => {
    const { service, runner } = createService(
      { note: noteHandler(), dossier: failingDossierHandler() },
      [{ tableName: 'note', target: Note, deleteDateColumn: {}, relations: [] }],
    );

    await expect(
      service.executePlan(plan({ operation: 'INSERT', entity: 'note', fields: { text: 'Appeler' } }) as any, '7'),
    ).rejects.toThrow('Client introuvable');

    expect(runner.manager.delete).toHaveBeenCalledWith(Note, 9);
    expect(runner.manager.softDelete).not.toHaveBeenCalled();
  });

  it('met en corbeille seulement si une ligne liée empêche la suppression', async () => {
    const { service, runner } = createService(
      { note: noteHandler(), dossier: failingDossierHandler() },
      [{ tableName: 'note', target: Note, deleteDateColumn: {}, relations: [] }],
    );
    runner.manager.delete.mockRejectedValueOnce(new Error('ER_ROW_IS_REFERENCED_2') as never);

    await expect(
      service.executePlan(plan({ operation: 'INSERT', entity: 'note', fields: { text: 'Appeler' } }) as any, '7'),
    ).rejects.toThrow('Client introuvable');

    expect(runner.manager.softDelete).toHaveBeenCalledWith(Note, 9);
  });

  it('signale le collaborateur dont l’annulation échoue', async () => {
    const store = createDb();
    const { handler } = createEmployeeHandler(store);
    store.manager.update.mockRejectedValueOnce(new Error('Lock wait timeout') as never);
    const { service } = createService({ employee: handler, dossier: failingDossierHandler() });

    await expect(
      service.executePlan(
        plan({ operation: 'INSERT', entity: 'employee', fields: { full_name: 'Jean Dupont' } }) as any,
        '7',
      ),
    ).rejects.toThrow('n\'ont pas pu être annulé(s) : employee#412');
  });
});

describe('Identifiants d’un collaborateur créé par un plan IA', () => {
  const okDossierHandler = () => ({
    entityName: 'dossier',
    execute: jest.fn(async () => ({
      success: true,
      operation: 'INSERT',
      entityId: 77,
      affected: 1,
      data: { id: 77 },
      message: 'Dossier créé',
    })),
  });
  const employeeOp = {
    operation: 'INSERT',
    entity: 'employee',
    tempId: 'emp',
    fields: { full_name: 'Jean Dupont', email: 'jean.dupont@cabinet.com' },
  };

  it('plan en échec : aucun email d’identifiants vers le compte désactivé', async () => {
    const store = createDb();
    const { handler, sendCredentials, sentEmails } = createEmployeeHandler(store);
    const { service } = createService({ employee: handler, dossier: failingDossierHandler() });

    await expect(service.executePlan(plan(employeeOp) as any, '7')).rejects.toThrow('Client introuvable');

    expect(sendCredentials).not.toHaveBeenCalled();
    expect(sentEmails).toEqual([]);
    expect(store.activeUsers()).toEqual([]);
  });

  it('plan réussi : un seul email, envoyé après la validation de la transaction', async () => {
    const store = createDb();
    const { handler, sendCredentials, sentEmails } = createEmployeeHandler(store);
    const { service, runner } = createService({ employee: handler, dossier: okDossierHandler() });
    let committedBeforeSend = false;
    sendCredentials.mockImplementationOnce(async () => {
      committedBeforeSend = runner.commitTransaction.mock.calls.length === 1;
      sentEmails.push(store.db.user[0].email);
    });

    const results = await service.executePlan(plan(employeeOp) as any, '7');

    expect(sentEmails).toEqual(['jean.dupont@cabinet.com']);
    expect(sendCredentials).toHaveBeenCalledTimes(1);
    expect(committedBeforeSend).toBe(true);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    // L'action différée ne sort pas avec les résultats renvoyés au chat.
    expect(results.map((r) => r.afterCommit)).toEqual([undefined, undefined]);
    expect(results[0]).toMatchObject({ operation: 'INSERT', entityId: 412, affected: 1 });
  });

  it('un envoi en échec après validation ne fait ni échouer le plan ni annuler le collaborateur', async () => {
    const store = createDb();
    const { handler, sendCredentials } = createEmployeeHandler(store);
    sendCredentials.mockRejectedValueOnce(new Error('SMTP indisponible') as never);
    const { service, runner } = createService({ employee: handler, dossier: okDossierHandler() });

    const results = await service.executePlan(plan(employeeOp) as any, '7');

    expect(results).toHaveLength(2);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(store.activeUsers().map((u) => u.id)).toEqual([412]);
    expect(store.db.employee[0].deleted_at).toBeNull();
  });

  it('un doublon évité (collaborateur existant) ne renvoie pas d’identifiants', async () => {
    const store = createDb();
    store.addEmployee(30, 'jean.dupont@cabinet.com');
    const { handler, sendCredentials } = createEmployeeHandler(store);
    const { service } = createService({ employee: handler, dossier: okDossierHandler() });

    await service.executePlan(plan(employeeOp) as any, '7');

    expect(sendCredentials).not.toHaveBeenCalled();
  });
});
