// ============================================
// CONTRACT ROUTES
// Endpoints de Compliance Legal
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const LEGAL_URL = process.env.LEGAL_COMPLIANCE_URL || 'http://legal-compliance:3000';

// POST /v1/legal/contracts - Create contract
router.post('/contracts', async (req, res, next) => {
  try {
    const response = await axios.post(`${LEGAL_URL}/contracts`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/legal/contracts/:contractId/send - Send for signature
router.post('/contracts/:contractId/send', async (req, res, next) => {
  try {
    const response = await axios.post(`${LEGAL_URL}/contracts/${req.params.contractId}/send`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/contracts/:contractId - Get contract
router.get('/contracts/:contractId', async (req, res, next) => {
  try {
    // Would fetch contract
    res.json({ success: true, data: { id: req.params.contractId } });
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/contracts/:contractId/verify - Verify integrity
router.get('/contracts/:contractId/verify', async (req, res, next) => {
  try {
    const response = await axios.get(`${LEGAL_URL}/contracts/${req.params.contractId}/verify`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/contracts - List contracts
router.get('/contracts', async (req, res, next) => {
  try {
    // Would list contracts
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/templates - List templates
router.get('/templates', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: [
        { id: 'service', name: 'Contrato de Prestação de Serviços' },
        { id: 'subscription', name: 'Contrato de Assinatura' },
      ],
    });
  } catch (error) {
    next(error);
  }
});

export { router as contractRoutes };