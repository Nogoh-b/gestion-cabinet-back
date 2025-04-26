import * as crypto from 'crypto';

export class CryptoUtil {
  static encrypt(data: string, publicKey: string): string {
    return crypto.publicEncrypt(publicKey, Buffer.from(data)).toString('base64');
  }

  static decrypt(encryptedData: string, privateKey: string): string {
    return crypto.privateDecrypt(
      { key: privateKey, passphrase: '' },
      Buffer.from(encryptedData, 'base64'),
    ).toString();
  }
}