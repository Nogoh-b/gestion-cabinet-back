import { BadRequestException } from '@nestjs/common';

import { isAiLifecycleTable } from 'src/config/ai-database/ai-lifecycle-tables.config';
import { Permission } from 'src/core/enums/permission.enum';
import { runWithTenantContext } from '../../core/tenant/tenant.context';
import { Employee, EmployeeStatus } from '../agencies/employee/entities/employee.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { User } from '../iam/user/entities/user.entity';
import {
  AjouterCollaborateurAiAction,
  ChangerResponsableAiAction,
  DOSSIER_TEAM_ACTIONS,
  RetirerCollaborateurAiAction,
  pickEmployee,
} from './equipe-dossier.actions';

const person = (id: number, fullName: string, status = EmployeeStatus.ACTIVE) =>
  ({ id, status, position: 'avocat', user: { full_name: fullName } }) as unknown as Employee;

const brice = person(5, 'Nogoh Brice');
const ekane = person(7, 'Paul Ekane');
const ngo = person(9, 'Paul Ngo', EmployeeStatus.INACTIVE);

function setup(dossier: Partial<Dossier> & { is_closed?: boolean }) {
  const loaded = { id: 2, dossier_number: 'DOS-2026-0002', collaborators: [], is_closed: false, ...dossier };
  const repositories = new Map<unknown, unknown>([
    [Dossier, { findOne: jest.fn(async () => loaded) }],
    [Employee, { find: jest.fn(async () => [brice, ekane, ngo]) }],
    [User, { findOne: jest.fn(async ({ where }: any) => ({ id: where.id })) }],
  ]);
  const dataSource = { getRepository: (entity: unknown) => repositories.get(entity) } as any;
  const dossiers = { addCollaborator: jest.fn(), removeCollaborator: jest.fn(), update: jest.fn() } as any;
  return { dataSource, dossiers };
}

const inTenant = <T>(fn: () => Promise<T>) => runWithTenantContext(3, fn);

describe('équipe d’un dossier depuis le chat', () => {
  it('retrouve un collaborateur par son identifiant ou son nom, dans un sens ou l’autre, jamais au hasard', () => {
    const team = [brice, ekane, ngo];
    expect(pickEmployee(team, '5')).toBe(brice);
    expect(pickEmployee(team, 'Brice Nogoh')).toBe(brice);
    expect(pickEmployee(team, 'Maître Ekane')).toBe(ekane);
    expect(pickEmployee(team, 'Paul')).toBeUndefined();
    expect(pickEmployee(team, '')).toBeUndefined();
  });

  it('sont des actions métier directes, sous la permission du bouton de la fiche', () => {
    for (const type of DOSSIER_TEAM_ACTIONS) {
      const { definition } = new (type as any)({}, {});
      expect(definition).toMatchObject({ entity: 'dossiers', direct: true, permission: Permission.EDIT_DOSSIER });
      expect(definition.skillOnly).toBeFalsy();
    }
    // `dossiers` reste fermée aux écritures génériques : seule l'action y touche.
    expect(isAiLifecycleTable('dossiers')).toBe(true);
  });

  it('ajout : passe par la commande du dossier, après confirmation seulement', async () => {
    const { dataSource, dossiers } = setup({});
    const action = new AjouterCollaborateurAiAction(dataSource, dossiers);
    const prepared = await inTenant(() => action.prepare(2, { collaborateur: 'Nogoh Brice' }, '1'));
    expect(prepared.plannedMessage).toBe('Nogoh Brice à ajouter comme collaborateur du dossier DOS-2026-0002.');
    expect(prepared.data).toEqual({ id: 2, dossier_number: 'DOS-2026-0002' });
    expect(dossiers.addCollaborator).not.toHaveBeenCalled();
    expect(await prepared.run()).toBe('Nogoh Brice ajouté(e) comme collaborateur du dossier DOS-2026-0002.');
    expect(dossiers.addCollaborator).toHaveBeenCalledWith(2, 5, { id: 1 });
  });

  it('ajout déjà fait (collaborateur ou responsable) : annoncé, rien n’est appelé', async () => {
    const member = setup({ collaborators: [brice] as any });
    const already = await inTenant(() => new AjouterCollaborateurAiAction(member.dataSource, member.dossiers).prepare(2, { collaborateur: '5' }, '1'));
    expect(already.plannedMessage).toBe('Nogoh Brice est déjà collaborateur du dossier DOS-2026-0002 : rien à faire.');
    await already.run();
    expect(member.dossiers.addCollaborator).not.toHaveBeenCalled();

    const lawyer = setup({ lawyer_id: 5 } as any);
    const responsible = await inTenant(() => new AjouterCollaborateurAiAction(lawyer.dataSource, lawyer.dossiers).prepare(2, { collaborateur: 'Nogoh Brice' }, '1'));
    expect(responsible.plannedMessage).toContain("déjà l'avocat responsable");
  });

  it('ajout refusé lisiblement : dossier clôturé, collaborateur introuvable ou ambigu', async () => {
    const closed = setup({ is_closed: true } as any);
    await expect(inTenant(() => new AjouterCollaborateurAiAction(closed.dataSource, closed.dossiers).prepare(2, { collaborateur: 'Nogoh Brice' }, '1')))
      .rejects.toThrow('clôturé ou archivé');
    const open = setup({});
    await expect(inTenant(() => new AjouterCollaborateurAiAction(open.dataSource, open.dossiers).prepare(2, { collaborateur: 'Paul' }, '1')))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('la liste de la carte ne propose que les collaborateurs en activité', async () => {
    const { dataSource, dossiers } = setup({});
    const options = await inTenant(() => new AjouterCollaborateurAiAction(dataSource, dossiers).paramOptions());
    expect(options.collaborateur.map((option) => option.value)).toEqual([5, 7]);
    expect(options.collaborateur[0].label).toBe('Nogoh Brice · Avocat');
  });

  it('retrait : seulement un collaborateur du dossier, jamais le responsable', async () => {
    const member = setup({ collaborators: [ekane] as any, lawyer_id: 5 } as any);
    const action = new RetirerCollaborateurAiAction(member.dataSource, member.dossiers);
    const prepared = await inTenant(() => action.prepare(2, { collaborateur: 'Paul Ekane' }, '1'));
    await prepared.run();
    expect(member.dossiers.removeCollaborator).toHaveBeenCalledWith(2, 7, { id: 1 });
    await expect(inTenant(() => action.prepare(2, { collaborateur: 'Nogoh Brice' }, '1'))).rejects.toThrow('désignez d\'abord un autre responsable');
    const outside = await inTenant(() => action.prepare(2, { collaborateur: 'Paul Ngo' }, '1'));
    expect(outside.plannedMessage).toContain('rien à faire');
  });

  it('changement de responsable : même mise à jour que la fiche du dossier', async () => {
    const { dataSource, dossiers } = setup({ lawyer_id: 7, lawyer: ekane } as any);
    const action = new ChangerResponsableAiAction(dataSource, dossiers);
    const prepared = await inTenant(() => action.prepare(2, { responsable: 'Brice Nogoh' }, '1'));
    expect(prepared.plannedMessage).toBe('Nogoh Brice à désigner responsable du dossier DOS-2026-0002 (à la place de Paul Ekane).');
    await prepared.run();
    expect(dossiers.update).toHaveBeenCalledWith(2, { lawyer_id: 5 }, { id: 1 });
    const same = await inTenant(() => action.prepare(2, { responsable: 'Paul Ekane' }, '1'));
    expect(same.plannedMessage).toContain('rien à faire');
  });
});
