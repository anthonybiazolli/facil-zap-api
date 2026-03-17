// ============================================
// CONTRACT ENGINE
// Motor de Prova de Integridade
// Compliance Automático com ZapSign
// ============================================

import { createHash } from 'crypto';
import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import Handlebars from 'handlebars';
import axios from 'axios';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { createLogger } from '../utils/logger';
import {
  ContractData,
  ContractTemplate,
  HashResult,
  ZapSignDocument,
  EmailConfig,
} from '../types';

const logger = createLogger('ContractEngine');

export class ContractEngine {
  private zapSignApiKey: string;
  private zapSignWebhookSecret: string;
  private hashSecret: string;
  private gmailTransporter?: nodemailer.Transporter;

  constructor(
    zapSignApiKey: string,
    zapSignWebhookSecret: string,
    hashSecret: string,
    gmailConfig?: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      fromEmail: string;
    }
  ) {
    this.zapSignApiKey = zapSignApiKey;
    this.zapSignWebhookSecret = zapSignWebhookSecret;
    this.hashSecret = hashSecret;

    // Initialize Gmail SMTP if config provided
    if (gmailConfig) {
      this.gmailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: gmailConfig.fromEmail,
          clientId: gmailConfig.clientId,
          clientSecret: gmailConfig.clientSecret,
          refreshToken: gmailConfig.refreshToken,
        },
      });
    }
  }

  // ============================================
  // HASHING DE CONTRATO (Prova de Integridade)
  // ============================================

  /**
   * Gera hash SHA-256 do conteúdo do contrato
   * Reivindicação 1: Sistema de prova de integridade
   */
  generateContractHash(contractData: ContractData): HashResult {
    // Criar string canônica do contrato
    const canonicalString = this.createCanonicalString(contractData);
    
    // Adicionar salt secreto para prevenir rainbow tables
    const saltedData = `${canonicalString}:${this.hashSecret}`;
    
    // Gerar hash SHA-256
    const hash = createHash('sha256').update(saltedData).digest('hex');
    
    logger.info({ contractId: contractData.id, hash }, 'Contract hash generated');
    
    return {
      hash,
      algorithm: 'SHA-256',
      timestamp: new Date(),
      canonicalString: process.env.NODE_ENV === 'development' ? canonicalString : undefined,
    };
  }

  /**
   * Verifica integridade do contrato
   */
  verifyContractIntegrity(contractData: ContractData, expectedHash: string): boolean {
    const result = this.generateContractHash(contractData);
    return result.hash === expectedHash;
  }

  private createCanonicalString(data: ContractData): string {
    // Ordenar campos para garantir consistência
    const ordered = {
      id: data.id,
      providerName: data.providerName,
      providerDocument: data.providerDocument,
      clientName: data.clientName,
      clientDocument: data.clientDocument,
      value: data.value.toFixed(2),
      currency: data.currency,
      createdAt: data.createdAt.toISOString(),
      terms: data.terms,
    };
    
    return JSON.stringify(ordered, Object.keys(ordered).sort());
  }

  // ============================================
  // GERAÇÃO DE PDF
  // ============================================

  async generateContractPDF(contractData: ContractData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 50;
    const margin = 50;
    const lineHeight = 20;

    // Título
    page.drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', {
      x: margin,
      y,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight * 2;

    // Hash de integridade
    const hashResult = this.generateContractHash(contractData);
    page.drawText(`Hash de Integridade: ${hashResult.hash.substring(0, 32)}...`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= lineHeight * 2;

    // Partes
    page.drawText('PARTES', {
      x: margin,
      y,
      size: 12,
      font: boldFont,
    });
    y -= lineHeight;

    page.drawText(`CONTRATANTE: ${contractData.clientName}`, {
      x: margin,
      y,
      size: 10,
      font,
    });
    y -= lineHeight;

    page.drawText(`CNPJ/CPF: ${contractData.clientDocument}`, {
      x: margin,
      y,
      size: 10,
      font,
    });
    y -= lineHeight * 2;

    page.drawText(`CONTRATADO: ${contractData.providerName}`, {
      x: margin,
      y,
      size: 10,
      font,
    });
    y -= lineHeight;

    page.drawText(`CNPJ/CPF: ${contractData.providerDocument}`, {
      x: margin,
      y,
      size: 10,
      font,
    });
    y -= lineHeight * 2;

    // Objeto
    page.drawText('OBJETO', {
      x: margin,
      y,
      size: 12,
      font: boldFont,
    });
    y -= lineHeight;

    const terms = this.wrapText(contractData.terms, 80);
    for (const line of terms) {
      page.drawText(line, {
        x: margin,
        y,
        size: 10,
        font,
      });
      y -= lineHeight;
    }
    y -= lineHeight;

    // Valor
    page.drawText('VALOR', {
      x: margin,
      y,
      size: 12,
      font: boldFont,
    });
    y -= lineHeight;

    page.drawText(`R$ ${contractData.value.toFixed(2)}`, {
      x: margin,
      y,
      size: 10,
      font,
    });
    y -= lineHeight * 3;

    // Assinaturas
    page.drawText('ASSINATURAS', {
      x: margin,
      y,
      size: 12,
      font: boldFont,
    });
    y -= lineHeight * 3;

    // Linha para assinatura do cliente
    page.drawLine({
      start: { x: margin, y },
      end: { x: width / 2 - 20, y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;

    page.drawText(`${contractData.clientName} (Cliente)`, {
      x: margin,
      y,
      size: 10,
      font,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private wrapText(text: string, maxLength: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length > maxLength) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }
    lines.push(currentLine.trim());
    return lines;
  }

  // ============================================
  // ZAPSIGN INTEGRATION
  // ============================================

  async createZapSignDocument(
    contractData: ContractData,
    pdfBuffer: Buffer
  ): Promise<ZapSignDocument> {
    try {
      // Converter PDF para base64
      const base64Pdf = pdfBuffer.toString('base64');

      const response = await axios.post(
        'https://api.zapsign.com.br/api/v1/docs/',
        {
          name: `Contrato - ${contractData.clientName}`,
          base64_pdf: base64Pdf,
          signers: [
            {
              name: contractData.clientName,
              email: contractData.clientEmail,
              send_email: true,
            },
          ],
          lang: 'pt-br',
          external_id: contractData.id,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.zapSignApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({ 
        contractId: contractData.id, 
        zapSignId: response.data.doc_id 
      }, 'ZapSign document created');

      return {
        id: response.data.doc_id,
        token: response.data.token,
        status: response.data.status,
        createdAt: new Date(),
        signUrl: response.data.sign_url,
      };
    } catch (error) {
      logger.error({ error, contractId: contractData.id }, 'Failed to create ZapSign document');
      throw error;
    }
  }

  async getZapSignDocumentStatus(docId: string): Promise<string> {
    try {
      const response = await axios.get(
        `https://api.zapsign.com.br/api/v1/docs/${docId}/`,
        {
          headers: {
            'Authorization': `Bearer ${this.zapSignApiKey}`,
          },
        }
      );

      return response.data.status;
    } catch (error) {
      logger.error({ error, docId }, 'Failed to get ZapSign document status');
      throw error;
    }
  }

  // ============================================
  // EMAIL NOTIFICATIONS (Google Workspace)
  // ============================================

  async sendContractEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer }>
  ): Promise<void> {
    if (!this.gmailTransporter) {
      throw new Error('Gmail transporter not configured');
    }

    try {
      await this.gmailTransporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL,
        to,
        subject,
        html,
        attachments: attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
        })),
      });

      logger.info({ to, subject }, 'Contract email sent');
    } catch (error) {
      logger.error({ error, to }, 'Failed to send contract email');
      throw error;
    }
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  async handleZapSignWebhook(payload: any, signature: string): Promise<{
    contractId: string;
    status: string;
    signedAt?: Date;
  }> {
    // Verificar assinatura do webhook
    const expectedSignature = createHash('sha256')
      .update(`${JSON.stringify(payload)}:${this.zapSignWebhookSecret}`)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new Error('Invalid webhook signature');
    }

    const { external_id, status, signed_at } = payload;

    logger.info({ contractId: external_id, status }, 'ZapSign webhook received');

    return {
      contractId: external_id,
      status,
      signedAt: signed_at ? new Date(signed_at) : undefined,
    };
  }

  // ============================================
  // TEMPLATES
  // ============================================

  getContractTemplate(type: string): ContractTemplate {
    const templates: Record<string, ContractTemplate> = {
      'service': {
        name: 'Contrato de Prestação de Serviços',
        description: 'Contrato padrão para prestação de serviços de API',
        defaultTerms: `O CONTRATADO se obriga a prestar serviços de API de automação de mensagens conforme especificado no plano contratado.

O CONTRATANTE se obriga a:
a) Utilizar os serviços de forma ética e legal;
b) Não utilizar para spam ou práticas abusivas;
c) Efetuar o pagamento conforme acordado.

O valor do serviço será cobrado mensalmente via PIX.`,
      },
      'subscription': {
        name: 'Contrato de Assinatura',
        description: 'Contrato de assinatura recorrente',
        defaultTerms: `Assinatura mensal dos serviços FacilZap API.

Cancelamento pode ser solicitado a qualquer momento, com efeito no próximo ciclo de faturamento.`,
      },
    };

    return templates[type] || templates['service'];
  }
}