import * as crypto from 'crypto';

export class GenCOde {
  static generateCode(clientId: number, salt = 0): string {
    const prefix = `${this.randomDigits(2)}`;
    const today = new Date().toISOString().slice(0, 10);
    const raw = `${clientId}-${today}-${salt}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const shortHash = parseInt(hash.slice(0, 8), 16).toString().slice(0, 5);
    return `${prefix}${shortHash}`;
  }


  static randomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }




  
}