// ============================================
// LEGAL COMPLIANCE - TYPES
// Micro SaaS Legal - Compliance Automático
// ============================================

export interface ContractData {
  id: string;
  providerName: string;
  providerDocument: string;
  clientName: string;
  clientDocument: string;
  clientEmail: string;
  value: number;
  currency: string;
  terms: string;
  createdAt: Date;
  templateType?: string;
}

export interface ContractTemplate {
  name: string;
  description: string;
  defaultTerms: string;
}

export interface HashResult {
  hash: string;
  algorithm: string;
  timestamp: Date;
  canonicalString?: string;
}

export interface ZapSignDocument {
  id: string;
  token: string;
  status: string;
  createdAt: Date;
  signUrl: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface ContractStatus {
  id: string;
  status: 'DRAFT' | 'SENT' | 'OPENED' | 'SIGNED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  hash: string;
  zapSignDocId?: string;
  signedAt?: Date;
  signedByIp?: string;
  paymentReceivedAt?: Date;
  activatedAt?: Date;
}

export interface WebhookPayload {
  event: string;
  doc_id: string;
  external_id: string;
  status: string;
  signed_at?: string;
  signer?: {
    name: string;
    email: string;
  };
}