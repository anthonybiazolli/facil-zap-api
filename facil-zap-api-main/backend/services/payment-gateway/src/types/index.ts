// ============================================
// PAYMENT GATEWAY - TYPES
// Sistema de Faturamento PIX Zero Taxa
// ============================================

import { Agent } from 'https';

export interface PixPayload {
  payload: string; // Copia e Cola
  txid: string;
  amount: number;
  description: string;
  expiresAt?: Date;
}

export interface PixTransaction {
  endToEndId: string;
  txid?: string;
  amount: number;
  paidAt: Date;
  payerInfo?: {
    cpf?: string;
    cnpj?: string;
    nome?: string;
  };
  description?: string;
}

export interface PixStatus {
  txid: string;
  status: string;
  amount: number;
  paidAt?: string;
  endToEndId?: string;
}

export interface BankConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  httpsAgent?: Agent;
}

export interface Invoice {
  id: string;
  userId: string;
  contractId?: string;
  invoiceNumber: string;
  description: string;
  value: number;
  currency: string;
  pixTxid?: string;
  pixPayload?: string;
  pixQrCodeUrl?: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
  paidAt?: Date;
  paidAmount?: number;
  bankReference?: string;
  dueDate: Date;
  createdAt: Date;
}

export interface PaymentWebhook {
  event: 'pix.received' | 'pix.refunded' | 'invoice.paid' | 'invoice.overdue';
  txid: string;
  data: {
    amount: number;
    endToEndId?: string;
    timestamp: Date;
  };
}

export interface PollingConfig {
  intervalMs: number;
  maxRetries: number;
  timeoutMs: number;
}