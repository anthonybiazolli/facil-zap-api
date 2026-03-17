// ============================================
// PIX SERVICE
// Sistema de Faturamento PIX Zero Taxa
// Geração de Payload e QR Code
// ============================================

import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import axios from 'axios';
import { createLogger } from '../utils/logger';
import {
  PixPayload,
  PixTransaction,
  BankConfig,
  PixStatus,
} from '../types';

const logger = createLogger('PixService');

export class PixService {
  private bankConfig: BankConfig;
  private pixKey: string;
  private merchantName: string;
  private merchantCity: string;

  constructor(
    bankConfig: BankConfig,
    pixKey: string,
    merchantName: string,
    merchantCity: string
  ) {
    this.bankConfig = bankConfig;
    this.pixKey = pixKey;
    this.merchantName = merchantName;
    this.merchantCity = merchantCity;
  }

  // ============================================
  // GERAÇÃO DE PAYLOAD PIX (Copia e Cola)
  // ============================================

  /**
   * Gera o payload PIX completo (Copia e Cola)
   * Formato conforme especificação BACEN
   */
  generatePixPayload(params: {
    txid: string;
    amount: number;
    description: string;
    expiresIn?: number; // segundos
  }): PixPayload {
    const { txid, amount, description, expiresIn } = params;

    // IDs dos campos EMV
    const ID_PAYLOAD_FORMAT = '00';
    const ID_MERCHANT_ACCOUNT = '26';
    const ID_MERCHANT_CATEGORY = '52';
    const ID_TRANSACTION_CURRENCY = '53';
    const ID_TRANSACTION_AMOUNT = '54';
    const ID_COUNTRY_CODE = '58';
    const ID_MERCHANT_NAME = '59';
    const ID_MERCHANT_CITY = '60';
    const ID_ADDITIONAL_DATA = '62';
    const ID_CRC16 = '63';

    // Valores fixos
    const payloadFormat = '01'; // Payload Format Indicator
    const merchantCategory = '0000'; // MCC (Merchant Category Code)
    const currency = '986'; // BRL
    const countryCode = 'BR';

    // Conta do comerciante (GUI + chave PIX)
    const gui = 'br.gov.bcb.pix';
    const merchantAccountValue = `${gui}01${this.formatField(this.pixKey)}`;
    const merchantAccount = this.formatField(merchantAccountValue, ID_MERCHANT_ACCOUNT);

    // Dados adicionais (TXID)
    const txidField = `05${this.formatField(txid)}`;
    const additionalData = this.formatField(txidField, ID_ADDITIONAL_DATA);

    // Montar payload
    let payload = '';
    payload += `${ID_PAYLOAD_FORMAT}${this.formatLength(payloadFormat)}${payloadFormat}`;
    payload += merchantAccount;
    payload += `${ID_MERCHANT_CATEGORY}${this.formatLength(merchantCategory)}${merchantCategory}`;
    payload += `${ID_TRANSACTION_CURRENCY}${this.formatLength(currency)}${currency}`;
    
    // Valor (opcional)
    const amountStr = amount.toFixed(2);
    payload += `${ID_TRANSACTION_AMOUNT}${this.formatLength(amountStr)}${amountStr}`;
    
    payload += `${ID_COUNTRY_CODE}${this.formatLength(countryCode)}${countryCode}`;
    payload += `${ID_MERCHANT_NAME}${this.formatLength(this.merchantName)}${this.merchantName}`;
    payload += `${ID_MERCHANT_CITY}${this.formatLength(this.merchantCity)}${this.merchantCity}`;
    payload += additionalData;

    // Calcular CRC16
    const crc = this.calculateCRC16(payload + ID_CRC16 + '04');
    payload += `${ID_CRC16}04${crc}`;

    logger.info({ txid, amount }, 'PIX payload generated');

    return {
      payload,
      txid,
      amount,
      description,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  }

  /**
   * Gera QR Code a partir do payload
   */
  async generateQRCode(payload: string): Promise<string> {
    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      return dataUrl;
    } catch (error) {
      logger.error({ error }, 'Failed to generate QR code');
      throw error;
    }
  }

  // ============================================
  // INTEGRAÇÃO BANCÁRIA (Banco Inter)
  // ============================================

  /**
   * Cria cobrança PIX via API do banco
   */
  async createPixCharge(params: {
    txid: string;
    amount: number;
    description: string;
    expiresIn?: number;
  }): Promise<{
    txid: string;
    pixCopyPaste: string;
    qrCodeBase64: string;
    expiration: number;
  }> {
    try {
      // Obter token de acesso
      const token = await this.getBankAccessToken();

      // Criar cobrança
      const response = await axios.put(
        `${this.bankConfig.baseUrl}/pix/v2/cob/${params.txid}`,
        {
          calendario: {
            expiracao: params.expiresIn || 86400,
          },
          valor: {
            original: params.amount.toFixed(2),
          },
          chave: this.pixKey,
          solicitacaoPagador: params.description,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: this.bankConfig.httpsAgent,
        }
      );

      // Gerar QR Code
      const pixPayload = this.generatePixPayload(params);
      const qrCodeBase64 = await this.generateQRCode(pixPayload.payload);

      logger.info({ txid: params.txid }, 'PIX charge created via bank API');

      return {
        txid: params.txid,
        pixCopyPaste: pixPayload.payload,
        qrCodeBase64,
        expiration: response.data.calendario.expiracao,
      };
    } catch (error) {
      logger.error({ error, txid: params.txid }, 'Failed to create PIX charge');
      throw error;
    }
  }

  /**
   * Consulta status do PIX
   */
  async checkPixStatus(txid: string): Promise<PixStatus> {
    try {
      const token = await this.getBankAccessToken();

      const response = await axios.get(
        `${this.bankConfig.baseUrl}/pix/v2/cob/${txid}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          httpsAgent: this.bankConfig.httpsAgent,
        }
      );

      const data = response.data;

      return {
        txid,
        status: data.status, // ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR, etc.
        amount: parseFloat(data.valor.original),
        paidAt: data.pix?.[0]?.horario,
        endToEndId: data.pix?.[0]?.endToEndId,
      };
    } catch (error) {
      logger.error({ error, txid }, 'Failed to check PIX status');
      throw error;
    }
  }

  /**
   * Lista PIX recebidos em um período
   */
  async listReceivedPix(
    startDate: Date,
    endDate: Date
  ): Promise<PixTransaction[]> {
    try {
      const token = await this.getBankAccessToken();

      const response = await axios.get(
        `${this.bankConfig.baseUrl}/pix/v2/pix`,
        {
          params: {
            'inicio': startDate.toISOString(),
            'fim': endDate.toISOString(),
          },
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          httpsAgent: this.bankConfig.httpsAgent,
        }
      );

      return response.data.pix.map((p: any) => ({
        endToEndId: p.endToEndId,
        txid: p.txid,
        amount: parseFloat(p.valor),
        paidAt: new Date(p.horario),
        payerInfo: p.pagador,
        description: p.infoPagador,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to list received PIX');
      throw error;
    }
  }

  /**
   * Solicita devolução de PIX
   */
  async requestRefund(
    endToEndId: string,
    refundId: string,
    amount: number
  ): Promise<boolean> {
    try {
      const token = await this.getBankAccessToken();

      await axios.post(
        `${this.bankConfig.baseUrl}/pix/v2/pix/${endToEndId}/devolucao/${refundId}`,
        {
          valor: amount.toFixed(2),
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: this.bankConfig.httpsAgent,
        }
      );

      logger.info({ endToEndId, refundId }, 'Refund requested');
      return true;
    } catch (error) {
      logger.error({ error, endToEndId }, 'Failed to request refund');
      throw error;
    }
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================

  private async getBankAccessToken(): Promise<string> {
    try {
      const response = await axios.post(
        `${this.bankConfig.baseUrl}/oauth/v2/token`,
        {
          grant_type: 'client_credentials',
          client_id: this.bankConfig.clientId,
          client_secret: this.bankConfig.clientSecret,
          scope: 'pix.read pix.write',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          httpsAgent: this.bankConfig.httpsAgent,
        }
      );

      return response.data.access_token;
    } catch (error) {
      logger.error({ error }, 'Failed to get bank access token');
      throw error;
    }
  }

  private formatField(value: string, id?: string): string {
    const length = value.length.toString().padStart(2, '0');
    const formatted = `${length}${value}`;
    return id ? `${id}${this.formatLength(formatted)}${formatted}` : formatted;
  }

  private formatLength(value: string): string {
    return value.length.toString().padStart(2, '0');
  }

  private calculateCRC16(payload: string): string {
    let crc = 0xFFFF;
    const polynomial = 0x1021;

    for (let i = 0; i < payload.length; i++) {
      const byte = payload.charCodeAt(i);
      crc ^= byte << 8;

      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc <<= 1;
        }
        crc &= 0xFFFF;
      }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Gera TXID único
   */
  generateTxid(): string {
    return `FZ${Date.now()}${randomBytes(4).toString('hex').toUpperCase()}`;
  }
}