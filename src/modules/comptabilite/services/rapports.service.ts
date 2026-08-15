import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompteComptable } from '../entities/compte.entity';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { LigneEcriture } from '../entities/ligne-ecriture.entity';
import { ClasseCompte, StatutExercice, TypeCompte } from '../enums/comptabilite.enums';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';

@Injectable()
export class RapportsService {
  constructor(
    @InjectRepository(CompteComptable)
    private readonly compteRepo: Repository<CompteComptable>,
    @InjectRepository(LigneEcriture)
    private readonly ligneRepo: Repository<LigneEcriture>,
    @InjectRepository(Ecriture)
    private readonly ecritureRepo: Repository<Ecriture>,
    @InjectRepository(ExerciceComptable)
    private readonly exerciceRepo: Repository<ExerciceComptable>,
  ) {}

  // ── Balance des comptes ──────────────────────────────────────────────────────
  async getBalance(exerciceId?: number): Promise<any[]> {
    const exercice = await this.resolveExercice(exerciceId);

    const qb = this.ligneRepo
      .createQueryBuilder('l')
      .select('l.compte_id', 'compte_id')
      .addSelect('SUM(l.debit)',  'totalDebit')
      .addSelect('SUM(l.credit)', 'totalCredit')
      .innerJoin('l.ecriture', 'e')
      .where('e.exercice_id = :eid', { eid: exercice.id })
      .groupBy('l.compte_id');
    // Isolation multi-tenant (defense-in-depth sur l'écriture jointe).
    addTenantCondition(qb, 'e');

    const rows = await qb.getRawMany();

    const comptes = await this.compteRepo.find({ order: { numero: 'ASC' } });
    const soldesMap = new Map(rows.map(r => [Number(r.compte_id), r]));

    return comptes
      .map(c => {
        const row          = soldesMap.get(c.id) ?? { totalDebit: 0, totalCredit: 0 };
        const totalDebit   = Number(row.totalDebit)  ?? 0;
        const totalCredit  = Number(row.totalCredit) ?? 0;
        const soldeDebit   = Math.max(totalDebit - totalCredit, 0);
        const soldeCredit  = Math.max(totalCredit - totalDebit, 0);
        return { compte: c, totalDebit, totalCredit, soldeDebit, soldeCredit };
      })
      .filter(r => r.totalDebit > 0 || r.totalCredit > 0);
  }

  // ── Grand livre d'un compte ──────────────────────────────────────────────────
  async getGrandLivre(compteId: number, exerciceId?: number): Promise<any> {
    const exercice = await this.resolveExercice(exerciceId);
    const compte   = await this.compteRepo.findOne({ where: { id: compteId } });

    const lignes = await this.ligneRepo.find({
      where: { compte_id: compteId },
      relations: ['ecriture', 'ecriture.journal'],
      order: { ecriture: { dateEcriture: 'ASC' } },
    });

    const lignesFiltrees = lignes.filter(l => l.ecriture?.exercice_id === exercice.id);

    let solde = 0;
    const mouvements = lignesFiltrees.map(l => {
      solde += Number(l.debit) - Number(l.credit);
      return {
        date:    l.ecriture.dateEcriture,
        numero:  l.ecriture.numero,
        libelle: l.libelle || l.ecriture.libelle,
        journal: l.ecriture.journal?.code,
        debit:   Number(l.debit),
        credit:  Number(l.credit),
        solde,
      };
    });

    return { compte, mouvements };
  }

  // ── Compte de résultat ───────────────────────────────────────────────────────
  async getResultat(exerciceId?: number): Promise<any> {
    const exercice = await this.resolveExercice(exerciceId);

    const qb = this.ligneRepo
      .createQueryBuilder('l')
      .select('c.numero',    'numero')
      .addSelect('c.libelle', 'libelle')
      .addSelect('c.typeCompte', 'typeCompte')
      .addSelect('SUM(l.debit)',   'totalDebit')
      .addSelect('SUM(l.credit)',  'totalCredit')
      .innerJoin('l.compte', 'c')
      .innerJoin('l.ecriture', 'e')
      .where('e.exercice_id = :eid', { eid: exercice.id })
      .andWhere('c.classe IN (:...classes)', { classes: [ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7] })
      .groupBy('c.id')
      .orderBy('c.numero', 'ASC');
    // Isolation multi-tenant.
    addTenantCondition(qb, 'e');

    const rows = await qb.getRawMany();

    const charges = rows.filter(r => Number(r.numero[0]) === ClasseCompte.CLASSE_6)
      .map(r => ({ numero: r.numero, libelle: r.libelle, montant: Number(r.totalDebit) - Number(r.totalCredit) }));

    const produits = rows.filter(r => Number(r.numero[0]) === ClasseCompte.CLASSE_7)
      .map(r => ({ numero: r.numero, libelle: r.libelle, montant: Number(r.totalCredit) - Number(r.totalDebit) }));

    const totalCharges = charges.reduce((s, c) => s + c.montant, 0);
    const totalProduits = produits.reduce((s, p) => s + p.montant, 0);
    const resultat = totalProduits - totalCharges;

    return { exercice, charges, produits, totalCharges, totalProduits, resultat };
  }

  // ── État TVA ─────────────────────────────────────────────────────────────────
  async getTva(exerciceId?: number, mois?: string): Promise<any> {
    const exercice = await this.resolveExercice(exerciceId);

    const qb = this.ligneRepo
      .createQueryBuilder('l')
      .select('c.numero',   'numero')
      .addSelect('c.libelle', 'libelle')
      .addSelect('SUM(l.debit)',  'totalDebit')
      .addSelect('SUM(l.credit)', 'totalCredit')
      .innerJoin('l.compte', 'c')
      .innerJoin('l.ecriture', 'e')
      .where('e.exercice_id = :eid', { eid: exercice.id })
      .andWhere("c.numero LIKE '445%'")
      .groupBy('c.id')
      .orderBy('c.numero', 'ASC');

    if (mois) {
      qb.andWhere("DATE_FORMAT(e.date_ecriture, '%Y-%m') = :mois", { mois });
    }
    // Isolation multi-tenant.
    addTenantCondition(qb, 'e');

    const rows = await qb.getRawMany();

    const tvaCollectee  = rows.filter(r => !r.numero.includes('_ded')).reduce((s, r) => s + (Number(r.totalCredit) - Number(r.totalDebit)), 0);
    const tvaDeductible = rows.filter(r =>  r.numero.includes('_ded')).reduce((s, r) => s + (Number(r.totalDebit) - Number(r.totalCredit)), 0);
    const tvaADeclareer = tvaCollectee - tvaDeductible;

    return { exercice, mois, lignes: rows, tvaCollectee, tvaDeductible, tvaADeclareer };
  }

  private async resolveExercice(id?: number): Promise<ExerciceComptable> {
    const ex = id
      ? await this.exerciceRepo.findOne({ where: { id } })
      : await this.exerciceRepo.findOne({ where: { statut: StatutExercice.OUVERT }, order: { annee: 'DESC' } });
    if (!ex) throw new Error('Aucun exercice comptable trouvé');
    return ex;
  }
}
