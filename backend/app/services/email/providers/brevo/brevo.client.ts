/**
 * BREVO API Client
 * Handles HTTP requests to BREVO API
 */

import { BrevoConfig, BrevoSendEmailRequest, BrevoApiResponse } from './brevo.types.js';
import { logger } from '../../../../common/utils/logger.util.js';

export class BrevoApiClient {
  constructor(private config: BrevoConfig) {}

  async sendTransacEmail(request: BrevoSendEmailRequest): Promise<BrevoApiResponse> {
    const url = `${this.config.apiUrl}/smtp/email`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`BREVO API Error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data as BrevoApiResponse;
    } catch (error) {
      logger.error('BREVO API request failed', { error, url });
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    const url = `${this.config.apiUrl}/account`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'api-key': this.config.apiKey,
        },
      });

      return response.ok;
    } catch (error) {
      logger.error('BREVO API connection test failed', { error });
      return false;
    }
  }
}
