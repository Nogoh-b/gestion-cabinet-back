export class DateUtils {
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  static isBefore(date1: Date, date2: Date): boolean {
    return date1.getTime() < date2.getTime();
  }

  static formatForDB(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  static isValidDate(date: any): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  static getDateNJoursAvant(date, n) {
    // Validation des paramètres
    if (typeof date !== 'string' || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new Error('La date doit être au format YYYY-MM-DD');
    }
    
    if (typeof n !== 'number' || n < 0) {
        throw new Error('Le nombre de jours doit être un nombre positif');
    }
    
    // Création de la date (attention: les mois commencent à 0 en JavaScript)
    const [annee, mois, jour] = date.split('-').map(Number);
    const dateObj = new Date(annee, mois - 1, jour);
    
    // Soustraire n jours
    dateObj.setDate(dateObj.getDate() - n);
    
    // Reformatage
    const nouvelleAnnee = dateObj.getFullYear();
    const nouveauMois = String(dateObj.getMonth() + 1).padStart(2, '0');
    const nouveauJour = String(dateObj.getDate()).padStart(2, '0');
    
    return `${nouvelleAnnee}-${nouveauMois}-${nouveauJour}`;
  }
}