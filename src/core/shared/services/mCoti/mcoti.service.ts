import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

























@Injectable()
export class McotiService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}
  private readonly PAYMENT_STATUS_SUCCESS = 'SUCCESS'; // Define your status constant

async callMcotiEndpoint(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  endpoint: string,
  payload?: any,
  params?: Record<string, any>
) {
  const url = `${this.configService.get('ENDPOINT_MCOTI')}/${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    params,
  };

  let response;
  switch (method) {
    case 'GET':
      response = await firstValueFrom(this.httpService.get(url, config));
      break;
    case 'POST':
      response = await firstValueFrom(this.httpService.post(url, payload, config));
      break;
    // … PUT, PATCH …
    default:
      throw new Error(`Méthode HTTP non supportée: ${method}`);
  }

  return response.data;
}




  private async getTokenDisbursement(): Promise<any> {
    const params = {
      customerKey: this.configService.get('CUSTOMER_KEY_DISBURSEMENT'),
      customerSecret: this.configService.get('CUSTOMER_SECRET_DISBURSEMENT'),
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.configService.get('GET_TOKEN_CASH_DISBURSEMENT') ?? '',
          params,
          {
            headers: {
              'Accept': '*/*',
              'Content-Type': 'application/json',
            },
          }
        )
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }





  async checkStatusPaymentDeposit(codePaymentCash: string, provider?: string): Promise<any> {
    // Si vous voulez conserver le return immédiat pour le debug
    // return this.updateStatus();

    let urlCashPayerStatus: string;

    // Déterminer l'URL en fonction du provider
    if (provider === 'OM') {
      urlCashPayerStatus = this.configService.get('CHECK_STATUS_PAYMENT_OM')!;
    } else if (provider === 'MOMO') {
      urlCashPayerStatus = this.configService.get('CHECK_STATUS_PAYMENT_MOMO')!;
    } else {
      return false;
    }

    try {
      const fullUrl = `${urlCashPayerStatus}/${codePaymentCash}`;
      const response = await firstValueFrom(
        this.httpService.get(fullUrl)
      );

      const requestStatusPayment = response.data;

      if (requestStatusPayment != null && requestStatusPayment.data?.payToken) {
        // Mettre à jour les propriétés comme dans le PHP
        // this.payTokenProvider = requestStatusPayment.data.payToken;
        // this.paymentCode = requestStatusPayment.data.id;

        if (requestStatusPayment.data.paymentStatus === this.PAYMENT_STATUS_SUCCESS || 
            requestStatusPayment.data.paymentStatus === 'SUCCESSFUL') {
          // Le paiement est réussi
          return requestStatusPayment;
        } else {
          return requestStatusPayment;
          /*          this.status = requestStatusPayment.data.paymentStatus;
          const saveResult = await this.save(false);
          return saveResult ? this.status : this.errors; */
        }
      } else {
        // Gestion des erreurs
        /*if (requestStatusPayment?.data?.code) {
          this.status = requestStatusPayment.data.code;
          this.reference = requestStatusPayment.data.message;
        } else if (requestStatusPayment?.data) {
          this.status = 'Error corrupted';
          this.reference = requestStatusPayment.message;
        }

        await this.save(false);
        
        // Log des erreurs dans un fichier
        this.logger.error('Payment status check failed', {
          response: requestStatusPayment,
          timestamp: new Date().toISOString(),
          codePaymentCash
        });*/

        return requestStatusPayment;
      }
    } catch (error) {
      /*this.logger.error('Error checking payment status', {
        error: error.response?.data || error.message,
        codePaymentCash,
        provider
      });*/

      // Vous pourriez vouloir lancer une exception ici selon votre logique métier
      throw new NotFoundException(error.message);
    }
  }








  public async checkStatusPaymentWithDraw(codePaymentCash: string): Promise<any> {
    try {
      // Get token first
      const dataToken = await this.getTokenDisbursement();
      // Check payment status
      const url = `${this.configService.get('CHECK_STATUS_WITHDRAWAL')}/${codePaymentCash}`;
      console.log(url + ' '+dataToken.access_token)
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dataToken.access_token}`,
          },
        })
      );
      this.logRequest('GET', url, null,  {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dataToken.access_token}`,
          });

      const requestStatusPayment = response.data;

      if (requestStatusPayment != null) {
        if (requestStatusPayment.data?.paymentStatus === this.PAYMENT_STATUS_SUCCESS) {
          
          return 1;
        } else {
          // Update model with current payment status
          return requestStatusPayment.data?.paymentStatus;

        }
      }
    } catch (error) {
      throw new NotFoundException(error.message);
      this.handleApiError(error);
    }
  }

  private logRequest(
    method: string,
    url: string,
    body: any,
    headers: Record<string, string>,
    params?: Record<string, any>
  ): void {
    console.log('Outgoing Request:');
    console.log(`Method: ${method}`);
    console.log(`URL: ${url}`);
    
    if (body) {
      console.log(`Body: ${JSON.stringify(body, null, 2)}`);
    }
    
    if (params) {
      console.log(`Params: ${JSON.stringify(params, null, 2)}`);
    }
    
    console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);
    console.log('----------------------------');
  }

  private async updateStatus(model: any): Promise<void> {
    // Implement your status update logic here
    // This would depend on your ORM/ODM (TypeORM, Mongoose, etc.)
    await model.save();
  }

  private handleApiError(error: any): never {
    if (error.response) {
      // Server error (4xx, 5xx)
      throw new Error(`Payment API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // No response received
      throw new Error('No response received from Payment API');
    } else {
      // Configuration error
      throw new Error(`API call configuration error: ${error.message}`);
    }
  }














}