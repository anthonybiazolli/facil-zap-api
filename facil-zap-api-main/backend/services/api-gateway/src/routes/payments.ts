// ============================================
// PAYMENT ROUTES
// Endpoints de Pagamento PIX
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const PAYMENT_URL = process.env.PAYMENT_GATEWAY_URL || 'http://payment-gateway:3000';

// POST /v1/payments/invoices - Create invoice
router.post('/invoices', async (req, res, next) => {
  try {
    const response = await axios.post(`${PAYMENT_URL}/invoices`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/payments/invoices/:invoiceId - Get invoice
router.get('/invoices/:invoiceId', async (req, res, next) => {
  try {
    const response = await axios.get(`${PAYMENT_URL}/invoices/${req.params.invoiceId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/payments/invoices - List invoices
router.get('/invoices', async (req, res, next) => {
  try {
    const response = await axios.get(`${PAYMENT_URL}/invoices`, { params: req.query });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/payments/pix/generate - Generate PIX payload
router.post('/pix/generate', async (req, res, next) => {
  try {
    const response = await axios.post(`${PAYMENT_URL}/pix/generate`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/payments/pix/status/:txid - Check PIX status
router.get('/pix/status/:txid', async (req, res, next) => {
  try {
    const response = await axios.get(`${PAYMENT_URL}/pix/status/${req.params.txid}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/payments/refund - Request refund
router.post('/refund', async (req, res, next) => {
  try {
    // Would implement refund
    res.json({ success: true, message: 'Refund requested' });
  } catch (error) {
    next(error);
  }
});

export { router as paymentRoutes };