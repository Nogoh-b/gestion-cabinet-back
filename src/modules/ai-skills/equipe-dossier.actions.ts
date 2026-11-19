// src/modules/ai-skills/equipe-dossier.actions.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type {
  AiActionDefinition,
  AiActionHandler,
  PreparedAiAction,
} from 'src/core/ai-database/write/ai-action.registry';
import { Permission } from 'src/core/enums/permission.enum';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Employee, EmployeeStatus } from '../agencies/employee/entities/employee.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DossiersService } from '../dossiers/dossiers.service';
import { UpdateDossierDto } from '../dossiers/dto/update-dossier.dto';
import { User } from '../iam/user/entities/user.entity';

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(?:maitre|me|mr|mme|m)\.?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Mots du nom dans n'importe quel ordre : « Nogoh Brice » = « Brice Nogoh ». */
const nameKey = (value: unknown) => normalize(value).split(' ').filter(Boolean).sort().join(' ');

export const employeeName = (employee: Employee) => employee.user?.full_name?.trim() || `Collaborateur #${employee.id}`;

/** Dossier cité par le compte rendu (lien) : jamais ses relations chargées (comptes des collaborateurs). */
const summary = (dossier: Dossier) => ({ id: dossier.id, dossier_number: dossier.dossier_number });

const POSITION_LABELS: Record<string, string> = {
  avocat: 'Avocat',
  collaborateur: 'Collaborateur',
  juriste: 'Juriste',
  comptable: 'Comptable',
  secretaire: 'Secrétaire',
  assistant: 'Assistant',
  stagiaire: 'Stagiaire',
  huissier: 'Huissier',
  administratif: 'Administratif',
  support: 'Support',
  apporteur_affaire: "Apporteur d'affaires",
};

/**
 * Collaborateur désigné par son identifiant (choix de la carte) ou son nom :
 * nom complet dans un sens ou dans l'autre, sinon un seul nom qui contient le
 * texte (ou y est contenu). Jamais au hasard : plusieurs candidats → aucun.
 */
export function pickEmployee(employees: Employee[], value: unknown): Employee | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return employees.find((employee) => employee.id === Number(text));
  const wanted = nameKey(text);
  const exact = employees.filter((employee) => nameKey(employeeName(employee)) === wanted);
  if (exact.length === 1) return exact[0];
  const near = employees.filter((employee) => {
    const name = normalize(employeeName(employee));
    const asked = normalize(text);
    return name && (name.includes(asked) || asked.includes(name));
  });
  return near.length === 1 ? near[0] : undefined;
}

/**
 * Équipe d'un dossier depuis le chat. `dossiers` suit un cycle de vie
 * métier : l'IA passe par les commandes de la fiche du dossier (membres,
 * audit, conversation du dossier, notifications), jamais par une écriture
 * directe sur dossiers, dossier_collaborators ou dossier_members.
 */
abstract class DossierTeamAction implements AiActionHandler {
  abstract readonly definition: AiActionDefinition;

  constructor(
    @InjectDataSource() protected readonly dataSource: DataSource,
    protected readonly dossiers: DossiersService,
  ) {}

  abstract prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction>;

  protected async loadDossier(targetId: string | number): Promise<Dossier> {
    const dossier = await this.dataSource.getRepository(Dossier).findOne({
      where: { id: Number(targetId), tenant_id: getCurrentTenantId() } as any,
      relations: ['collaborators', 'collaborators.user', 'lawyer', 'lawyer.user'],
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable dans ce cabinet.');
    return dossier;
  }

  /** Collaborateurs du cabinet ; `active` : seulement ceux qui travaillent (actifs ou en congé). */
  protected async employees(active = false): Promise<Employee[]> {
    const employees = await this.dataSource.getRepository(Employee).find({
      where: { tenant_id: getCurrentTenantId() } as any,
      relations: ['user'],
    });
    return active
      ? employees.filter((employee) => employee.status === EmployeeStatus.ACTIVE || employee.status === EmployeeStatus.VACATION)
      : employees;
  }

  protected async employee(value: unknown, label: string, among?: Employee[]): Promise<Employee> {
    if (!String(value ?? '').trim()) throw new BadRequestException(`Choisissez le ${label}.`);
    const found = pickEmployee(among ?? (await this.employees()), value);
    if (!found) throw new BadRequestException(`${label[0].toUpperCase()}${label.slice(1)} « ${value} » introuvable ou ambigu : choisissez-le dans la liste.`);
    return found;
  }

  protected async actor(userId: string): Promise<User> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: Number(userId) } as any });
    if (!user) throw new BadRequestException('Utilisateur introuvable.');
    return user;
  }

  protected options(employees: Employee[]) {
    return employees
      .map((employee) => ({
        value: employee.id,
        label: `${employeeName(employee)}${employee.position ? ` · ${POSITION_LABELS[employee.position] ?? employee.position}` : ''}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  protected isCollaborator(dossier: Dossier, employee: Employee): boolean {
    return (dossier.collaborators ?? []).some((collaborator) => collaborator.id === employee.id);
  }

  protected isResponsible(dossier: Dossier, employee: Employee): boolean {
    return Number(dossier.lawyer_id ?? dossier.lawyer?.id) === employee.id;
  }

  /** Opération sans effet (déjà fait) : annoncée, rien n'est appelé. */
  protected nothingToDo(dossier: Dossier, message: string): PreparedAiAction {
    return { data: summary(dossier), plannedMessage: `${message} : rien à faire.`, run: async () => `${message} (rien à faire).` };
  }
}

/** « Ajoute Paul Ngo comme collaborateur des dossiers DOS-1 et DOS-2 » : une opération par dossier. */
@Injectable()
export class AjouterCollaborateurAiAction extends DossierTeamAction {
  readonly definition: AiActionDefinition = {
    name: 'ajouter_collaborateur',
    entity: 'dossiers',
    direct: true,
    label: "Ajout d'un collaborateur",
    description:
      "Ajoute un collaborateur du cabinet à l'équipe d'un dossier (accès au dossier, à sa conversation et à ses notifications). C'est la SEULE façon d'ajouter un collaborateur : jamais d'INSERT ni d'UPDATE sur dossiers, dossier_collaborators ou dossier_members. Une opération par dossier.",
    permission: Permission.EDIT_DOSSIER,
    params: [{ name: 'collaborateur', label: 'Collaborateur', required: true, kind: 'enum', description: 'Nom du collaborateur à ajouter.' }],
    examples: [
      'Ajoute Paul Ngo comme collaborateur du dossier DOS-2026-0001',
      'Mets Maître Ekane sur les dossiers DOS-2026-0001 et DOS-2026-0002',
    ],
  };

  async paramOptions() {
    return { collaborateur: this.options(await this.employees(true)) };
  }

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    return (await this.prepare(targetId, params, '')).plannedMessage;
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const dossier = await this.loadDossier(targetId);
    const employee = await this.employee(params.collaborateur, 'collaborateur');
    const name = employeeName(employee);
    const number = dossier.dossier_number;
    if (this.isCollaborator(dossier, employee)) return this.nothingToDo(dossier, `${name} est déjà collaborateur du dossier ${number}`);
    if (this.isResponsible(dossier, employee)) return this.nothingToDo(dossier, `${name} est déjà l'avocat responsable du dossier ${number}`);
    if (dossier.is_closed) throw new BadRequestException(`Le dossier ${number} est clôturé ou archivé : son équipe ne change plus.`);
    return {
      data: summary(dossier),
      plannedMessage: `${name} à ajouter comme collaborateur du dossier ${number}.`,
      run: async () => {
        await this.dossiers.addCollaborator(dossier.id, employee.id, await this.actor(userId));
        return `${name} ajouté(e) comme collaborateur du dossier ${number}.`;
      },
    };
  }
}

/** « Retire Paul Ngo du dossier DOS-1 » : il perd l'accès au dossier et à sa conversation. */
@Injectable()
export class RetirerCollaborateurAiAction extends DossierTeamAction {
  readonly definition: AiActionDefinition = {
    name: 'retirer_collaborateur',
    entity: 'dossiers',
    direct: true,
    label: "Retrait d'un collaborateur",
    description:
      "Retire un collaborateur de l'équipe d'un dossier (il perd l'accès au dossier et à sa conversation). C'est la SEULE façon de le faire : jamais de DELETE sur dossier_collaborators ou dossier_members.",
    permission: Permission.EDIT_DOSSIER,
    params: [{ name: 'collaborateur', label: 'Collaborateur', required: true, kind: 'enum', description: 'Nom du collaborateur à retirer.' }],
    examples: ['Retire Paul Ngo du dossier DOS-2026-0001'],
    warning: "Le collaborateur perd l'accès au dossier dès la confirmation.",
  };

  async paramOptions(targetId: string | number) {
    const dossier = await this.loadDossier(targetId);
    return { collaborateur: this.options(dossier.collaborators ?? []) };
  }

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    return (await this.prepare(targetId, params, '')).plannedMessage;
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const dossier = await this.loadDossier(targetId);
    const employee = await this.employee(params.collaborateur, 'collaborateur');
    const name = employeeName(employee);
    const number = dossier.dossier_number;
    if (!this.isCollaborator(dossier, employee)) {
      if (this.isResponsible(dossier, employee)) {
        throw new BadRequestException(`${name} est l'avocat responsable du dossier ${number} : désignez d'abord un autre responsable.`);
      }
      return this.nothingToDo(dossier, `${name} ne fait pas partie des collaborateurs du dossier ${number}`);
    }
    if (dossier.is_closed) throw new BadRequestException(`Le dossier ${number} est clôturé ou archivé : son équipe ne change plus.`);
    return {
      data: summary(dossier),
      plannedMessage: `${name} à retirer des collaborateurs du dossier ${number}.`,
      run: async () => {
        await this.dossiers.removeCollaborator(dossier.id, employee.id, await this.actor(userId));
        return `${name} retiré(e) des collaborateurs du dossier ${number}.`;
      },
    };
  }
}

/** « Confie le dossier DOS-1 à Maître Ekane » : même changement que la fiche du dossier. */
@Injectable()
export class ChangerResponsableAiAction extends DossierTeamAction {
  readonly definition: AiActionDefinition = {
    name: 'changer_responsable',
    entity: 'dossiers',
    direct: true,
    label: "Changement d'avocat responsable",
    description:
      "Désigne l'avocat responsable d'un dossier (l'ancien reste collaborateur s'il l'était). C'est la SEULE façon de le faire : jamais d'UPDATE de dossiers.lawyer_id.",
    permission: Permission.EDIT_DOSSIER,
    params: [{ name: 'responsable', label: 'Nouveau responsable', required: true, kind: 'enum', description: 'Nom du collaborateur à désigner.' }],
    examples: ['Confie le dossier DOS-2026-0001 à Maître Ekane', 'Nogoh Brice devient responsable du dossier DOS-2026-0002'],
  };

  async paramOptions() {
    return { responsable: this.options(await this.employees(true)) };
  }

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    return (await this.prepare(targetId, params, '')).plannedMessage;
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const dossier = await this.loadDossier(targetId);
    const employee = await this.employee(params.responsable, 'responsable');
    const name = employeeName(employee);
    const number = dossier.dossier_number;
    if (this.isResponsible(dossier, employee)) return this.nothingToDo(dossier, `${name} est déjà l'avocat responsable du dossier ${number}`);
    const previous = dossier.lawyer ? employeeName(dossier.lawyer) : '';
    return {
      data: summary(dossier),
      plannedMessage: `${name} à désigner responsable du dossier ${number}${previous ? ` (à la place de ${previous})` : ''}.`,
      run: async () => {
        await this.dossiers.update(dossier.id, { lawyer_id: employee.id } as UpdateDossierDto, await this.actor(userId));
        return `${name} est désormais l'avocat responsable du dossier ${number}.`;
      },
    };
  }
}

export const DOSSIER_TEAM_ACTIONS = [AjouterCollaborateurAiAction, RetirerCollaborateurAiAction, ChangerResponsableAiAction];
