import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompteComptable } from '../entities/compte.entity';
import { ClasseCompte, TypeCompte } from '../enums/comptabilite.enums';

@Injectable()
export class ComptesService {
  constructor(
    @InjectRepository(CompteComptable)
    private readonly repo: Repository<CompteComptable>,
  ) {}

  findAll(): Promise<CompteComptable[]> {
    return this.repo.find({ order: { numero: 'ASC' } });
  }

  findByClasse(classe: ClasseCompte): Promise<CompteComptable[]> {
    return this.repo.find({ where: { classe }, order: { numero: 'ASC' } });
  }

  async findByNumero(numero: string): Promise<CompteComptable> {
    const compte = await this.repo.findOne({ where: { numero } });
    if (!compte) throw new NotFoundException(`Compte ${numero} introuvable`);
    return compte;
  }

  async create(data: Partial<CompteComptable>): Promise<CompteComptable> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<CompteComptable>): Promise<CompteComptable> {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } }) as Promise<CompteComptable>;
  }

  // Soldes de tous les comptes pour la balance
  async getSoldes(): Promise<{ compte: CompteComptable; totalDebit: number; totalCredit: number; solde: number }[]> {
    const comptes = await this.repo.find({
      relations: ['lignes'],
      order: { numero: 'ASC' },
    });

    return comptes.map(c => {
      const totalDebit  = c.lignes?.reduce((s, l) => s + Number(l.debit),  0) ?? 0;
      const totalCredit = c.lignes?.reduce((s, l) => s + Number(l.credit), 0) ?? 0;
      const solde = [TypeCompte.ACTIF, TypeCompte.CHARGE].includes(c.typeCompte)
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;
      return { compte: c, totalDebit, totalCredit, solde };
    });
  }
}
