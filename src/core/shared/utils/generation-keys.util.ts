import * as crypto from 'crypto';

export class GenKeys {
  private static readonly algorithm = 'aes-256-cbc';
  private static readonly password = 'my-encryption-key'; // ⚠️ à stocker de manière sécurisée !
  private static readonly ivLength = 16; // 16 bytes pour AES

  static encryptPrivateKey(privateKey: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const key = crypto.scryptSync(this.password, 'salt', 32); // Génère une clé de 256 bits

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // On concatène l'IV en hex au début pour le retrouver lors du déchiffrement
    return iv.toString('hex') + ':' + encrypted;
  }

  static decryptPrivateKey(encryptedData: string): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.password, 'salt', 32);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }


  static generateKeyPair(): { publicKey: string, privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    return {
      publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    };
  }

  static sign(data: string, privateKey: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, 'base64');
  }

  static verify(data: string, publicKey: string, signature: string): boolean {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  }
}