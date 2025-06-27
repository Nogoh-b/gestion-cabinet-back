import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';





@Injectable()
export class McotiService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}

  async callMcotiEndpoint(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    endpoint: string,
    payload?: any,
    params?: Record<string, any>
  ) {
    const url = `${this.configService.get('ENDPOINT_MCOTI')}/${endpoint}`; 
    console.log(url)
    
    try {
      const config = { 
        headers: {
          'Content-Type': 'application/json',
          // Ajoutez d'autres headers si nécessaire
        },
        params // Pour les paramètres de requête (spécialement utile pour GET)
      };

      let response;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await firstValueFrom(
            this.httpService.get(url, config)
          );
          break;
        case 'POST':
          response = await firstValueFrom(
            this.httpService.post(url, payload, config)
          );
          break;
        case 'PUT':
          response = await firstValueFrom(
            this.httpService.put(url, payload, config)
          );
          break;
        case 'PATCH':
          response = await firstValueFrom(
            this.httpService.patch(url, payload, config)
          );
          break;
        default:
          throw new Error(`Méthode HTTP non supportée: ${method}`);
      }

      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  private handleApiError(error: any) {
    if (error.response) {
      // Erreur côté serveur (4xx, 5xx)
      throw new Error(`MCOTI API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // Pas de réponse reçue
      throw new Error('No response received from MCOTI API');
    } else {
      // Erreur de configuration
      throw new Error(`API call configuration error: ${error.message}`);
    }
  }
}