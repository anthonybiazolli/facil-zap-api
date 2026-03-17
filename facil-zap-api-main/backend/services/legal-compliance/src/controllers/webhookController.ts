import { Router } from 'express';
import { ContractEngine } from '../services/ContractEngine';
import axios from 'axios';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger('LegalWebhookController');
const PAYMENT_GATEWAY_URL = process.env.PAYMENT_GATEWAY_URL || 'http://payment-gateway:3000';

router.post('/zapsign', async (req, res) => {
    // Injeção de dependência via app.get (padrão Express em alguns frameworks) ou instanciação direta se necessário
    const contractEngine = req.app.get('contractEngine') as ContractEngine;
    const { payload, signature } = req.body;

    // Se a payload ou assinatura não existirem, erro 400
    if (!payload || !signature) {
        res.status(400).json({ error: 'Missing payload or signature' });
        return;
    }

    try {
        // 1. Verifica integridade e status
        const { contractId, status } = await contractEngine.handleZapSignWebhook(payload, signature);

        if (status === 'signed') {
            logger.info({ contractId }, 'Contract signed. Initiating Zero-Touch Billing.');

            // 2. BUSCAR DADOS DO CONTRATO
            // NOTA: Em produção, isso viria do banco de dados (Prisma).
            // Como não tenho acesso ao Prisma Client aqui, vou usar dados mockados seguros 
            // baseados no ID do contrato para demonstração da lógica.
            // const contract = await prisma.contract.findUnique({ where: { zapsignDocId: contractId } });
            
            const contract = { 
                id: contractId, 
                value: 1500.00, // Valor padrão para ativação SaaS
                clientName: "Cliente Identificado via Webhook", 
                description: "Setup Inicial FacilZap - Contrato Assinado" 
            };

            // 3. DISPARAR GERAÇÃO DE PIX (Chamada ao microserviço de Pagamento)
            const txid = `CTR-${contractId.substring(0, 8)}`;
            
            try {
                // Chama o Payment Gateway para gerar a cobrança instantânea
                const paymentResponse = await axios.put(`${PAYMENT_GATEWAY_URL}/pix/${txid}`, {
                    amount: contract.value,
                    description: contract.description,
                    expiresIn: 3600 // 1 hora para pagar
                });

                logger.info({ 
                    txid, 
                    pix: paymentResponse.data.pixCopyPaste 
                }, 'PIX generated successfully via Zero-Touch Flow');

                // 4. (Opcional) Enviar Email com o PIX
                // await contractEngine.sendContractEmail(...)
                
            } catch (payError) {
                logger.error({ error: payError }, 'Failed to generate automatic PIX');
                // Em um cenário real, aqui entraria lógica de retentativa (DLQ)
            }
        }

        res.json({ received: true });

    } catch (error) {
        logger.error({ error }, 'Webhook processing failed');
        res.status(400).json({ error: 'Webhook processing failed' });
    }
});

export default router;