import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CryptoUtil } from '../shared/utils/crypto.util';

@Injectable()
export class HttpClientUtil {
  private client: AxiosInstance;

  constructor(private cryptoUtil: CryptoUtil) {
    this.client = axios.create({
      baseURL: process.env.API_GATEWAY_URL,
      timeout: 5000,
    });
  }

  async sendSignedRequest(data: any, privateKey: string): Promise<any> {
    const encryptedData = CryptoUtil.encrypt(JSON.stringify(data), privateKey);
    const response = await this.client.post('/transactions', { data: encryptedData });
    return response.data;
  }
}