import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { runWithoutRequestUser } from 'src/core/security/request-user.context';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { DossierAccessGrant } from './entities/dossier-access-grant.entity';
import { Dossier } from './entities/dossier.entity';

/**
 * Autorisations nominatives d'accès aux dossiers confidentiels.
 *
 * Seule l'administration manipule ces autorisations ; la règle de lecture
 * qu'elles alimentent vit dans `dossier-visibility.ts`.
 */
@Injectable()
export class DossierAccessGrantsService {
  constructor(
    @InjectRepository(DossierAccessGrant)
    private readonly grantRepository: Repository<DossierAccessGrant>,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  /** Autorisations actives d'un dossier, avec le collaborateur concerné. */
  listForDossier(dossierId: number): Promise<DossierAccessGrant[]> {
    return this.grantRepository.find({
      where: { dossier_id: dossierId, revoked_at: IsNull() },
      relations: ['employee', 'employee.user'],
      order: { granted_at: 'DESC' },
    });
  }

  /**
   * Accorde l'accès à un collaborateur. Idempotent : ré-accorder un accès
   * déjà actif ne crée pas de doublon.
   */
  async grant(
    dossierId: number,
    employeeId: number,
    grantedBy?: number,
    reason?: string,
  ): Promise<DossierAccessGrant> {
    // Le dossier est lu hors filtre de visibilité : l'administrateur doit
    // pouvoir ouvrir l'accès même si le patch masquerait le dossier.
    const dossier = await runWithoutRequestUser(() =>
      this.dossierRepository.findOne({ where: { id: dossierId } }),
    );
    if (!dossier) throw new NotFoundException('Dossier introuvable');

    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');

    const existing = await this.grantRepository.findOne({
      where: {
        dossier_id: dossierId,
        employee_id: employeeId,
        revoked_at: IsNull(),
      },
    });
    if (existing) return existing;

    return this.grantRepository.save(
      this.grantRepository.create({
        dossier_id: dossierId,
        employee_id: employeeId,
        granted_by: grantedBy,
        granted_at: new Date(),
        reason,
      }),
    );
  }

  /** Révoque un accès actif (trace conservée via `revoked_at`). */
  async revoke(dossierId: number, employeeId: number): Promise<void> {
    const grant = await this.grantRepository.findOne({
      where: {
        dossier_id: dossierId,
        employee_id: employeeId,
        revoked_at: IsNull(),
      },
    });
    if (!grant) throw new NotFoundException('Autorisation introuvable');

    grant.revoked_at = new Date();
    await this.grantRepository.save(grant);
  }
}
