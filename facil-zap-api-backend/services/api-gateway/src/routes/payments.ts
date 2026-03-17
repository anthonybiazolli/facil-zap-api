// ============================================
// PAYMENT ROUTES
// Endpoints de Pagamentos (PIX)
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const PAYMENT_GATEWAY_URL = process.env.PAYMENT_GATEWAY_URL || 'http://payment-gateway:3000';

// GET /v1/payments/invoices - List invoices
router.get('/invoices', async (req, res, next) => {
  try {
    const response = await axios.get(`${PAYMENT_GATEWAY_URL}/invoices`, {
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/payments/invoices - Create invoice
router.post('/invoices', async (req, res, next) => {
  try {
    const response = await axios.post(`${PAYMENT_GATEWAY_URL}/invoices`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/payments/invoices/:invoiceId - Get invoice
router.get('/invoices/:invoiceId', async (req, res, next) => {
  try {
    const response = await axios.get(`${PAYMENT_GATEWAY_URL}/invoices/${req.params.invoiceId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/payments/invoices/:invoiceId/cancel - Cancel invoice
router.post('/invoices/:invoiceId/cancel', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${PAYMENT_GATEWAY_URL}/invoices/${req.params.invoiceId}/cancel`
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/payments/pix/generate - Generate PIX
router.post('/pix/generate', async (req, res, next) => {
  try {
    const response = await axios.post(`${PAYMENT_GATEWAY_URL}/pix/generate`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/payments/pix/:txid/status - Get PIX status
router.get('/pix/:txid/status', async (req, res, next) => {
  try {
    const response = await axios.get(
      `${PAYMENT_GATEWAY_URL}/pix/${req.params.txid}/status`
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as paymentRoutes };
