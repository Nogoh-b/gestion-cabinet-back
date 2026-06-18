import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExerciceComptable } from '../entities/exercice.entity';
import { StatutExercice } from '../enums/comptabilite.enums';

@Injectable()
export class ExercicesService {
  constructor(
    @InjectRepository(ExerciceComptable)
    private readonly repo: Repository<ExerciceComptable>,
  ) {}

  findAll(): Promise<ExerciceComptable[]> {
    return this.repo.find({ order: { annee: 'DESC' } });
  }

  async findOuvert(): Promise<ExerciceComptable> {
    const exercice = await this.repo.findOne({
      where: { statut: StatutExercice.OUVERT },
      order: { annee: 'DESC' },
    });
    if (!exercice) throw new NotFoundException('Aucun exercice comptable ouvert');
    return exercice;
  }

  async create(annee: number): Promise<ExerciceComptable> {
    const exists = await this.repo.findOne({ where: { annee } });
    if (exists) throw new BadRequestException(`Un exercice existe déjà pour ${annee}`);
    return this.repo.save(this.repo.create({
      annee,
      dateDebut: new Date(`${annee}-01-01`),
      dateFin:   new Date(`${annee}-12-31`),
      statut:    StatutExercice.OUVERT,
    }));
  }

  async cloturer(id: number): Promise<ExerciceComptable> {
    const exercice = await this.repo.findOne({ where: { id } });
    if (!exercice) throw new NotFoundException(`Exercice ${id} introuvable`);
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException('Cet exercice est déjà clôturé');
    }
    exercice.statut      = StatutExercice.CLOTURE;
    exercice.dateCloture = new Date();
    return this.repo.save(exercice);
  }
}
