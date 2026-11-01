import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompteComptable } from '../entities/compte.entity';
import {
  ClasseCompte,
  StatutEcriture,
  TypeCompte,
} from '../enums/comptabilite.enums';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { CreateCompteDto } from '../dto/create-compte.dto';

@Injectable()
export class ComptesService {
  constructor(
    @InjectRepository(CompteComptable)
    private readonly repo: Repository<CompteComptable>,
  ) {}

  findAll(): Promise<CompteComptable[]> {
    return this.repo.find({
      where: { tenant_id: getCurrentTenantId() },
      order: { numero: 'ASC' },
    });
  }

  findByClasse(classe: ClasseCompte): Promise<CompteComptable[]> {
    return this.repo.find({
      where: { tenant_id: getCurrentTenantId(), classe },
      order: { numero: 'ASC' },
    });
  }

  async findByNumero(numero: string): Promise<CompteComptable> {
    const compte = await this.repo.findOne({
      where: { tenant_id: getCurrentTenantId(), numero },
    });
    if (!compte) throw new NotFoundException(`Compte ${numero} introuvable`);
    return compte;
  }

  async create(data: CreateCompteDto): Promise<CompteComptable> {
    const tenantId = getCurrentTenantId();
    const numero = data.numero.trim();
    const existing = await this.repo.findOne({
      where: { tenant_id: tenantId, numero },
    });
    if (existing) {
      throw new ConflictException(
        `Le compte ${numero} existe déjà dans ce cabinet`,
      );
    }
    return this.repo.save(
      this.repo.create({
        numero,
        libelle: data.libelle.trim(),
        typeCompte: data.typeCompte,
        classe: data.classe,
        actif: data.actif ?? true,
        description: data.description?.trim() || undefined,
        tenant_id: tenantId,
      }),
    );
  }

  async update(id: number, data: Partial<CompteComptable>): Promise<CompteComptable> {
    const compte = await this.repo.findOne({
      where: { tenant_id: getCurrentTenantId(), id },
    });
    if (!compte) throw new NotFoundException(`Compte ${id} introuvable`);
    Object.assign(compte, data, {
      id: compte.id,
      tenant_id: compte.tenant_id,
    });
    return this.repo.save(compte);
  }

  // Soldes de tous les comptes pour la balance
  async getSoldes(): Promise<{ compte: CompteComptable; totalDebit: number; totalCredit: number; solde: number }[]> {
    const comptes = await this.repo.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['lignes', 'lignes.ecriture'],
      order: { numero: 'ASC' },
    });

    return comptes.map(c => {
      const tenantId = getCurrentTenantId();
      const lignes = (c.lignes ?? []).filter(
        (ligne) =>
          ligne.ecriture?.tenant_id === tenantId &&
          [
            StatutEcriture.POSTED,
            StatutEcriture.REVERSED,
          ].includes(ligne.ecriture.status),
      );
      const totalDebit = lignes.reduce(
        (sum, ligne) => sum + Number(ligne.debit),
        0,
      );
      const totalCredit = lignes.reduce(
        (sum, ligne) => sum + Number(ligne.credit),
        0,
      );
      const solde = [TypeCompte.ACTIF, TypeCompte.CHARGE].includes(c.typeCompte)
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;
      return { compte: c, totalDebit, totalCredit, solde };
    });
  }
}
