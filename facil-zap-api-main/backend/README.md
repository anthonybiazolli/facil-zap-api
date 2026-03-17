# Facil Zap API v2.0

Microserviços de Automação WhatsApp com **Anti-Ban 2.0**, **Compliance Legal Automático** e **PIX Zero Taxa**.

## 🏗️ Arquitetura de Microserviços

```
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                               │
│                    (118 Endpoints Business)                      │
└──────────────┬────────────────────────────────┬─────────────────┘
               │                                │
    ┌──────────▼──────────┐          ┌──────────▼──────────┐
    │   Session Keeper    │          │   Message Queue     │
    │  (Noise Protocol)   │          │   (Redis/BullMQ)    │
    └──────────┬──────────┘          └──────────┬──────────┘
               │                                │
    ┌──────────▼──────────┐          ┌──────────▼──────────┐
    │   Anti-Ban Engine   │          │  Legal Compliance   │
    │    (Algoritmo 2.0)  │          │    (ZapSign)        │
    └─────────────────────┘          └──────────┬──────────┘
                                                │
                                     ┌──────────▼──────────┐
                                     │  Payment Gateway    │
                                     │    (PIX Zero)       │
                                     └─────────────────────┘
```

## 📋 Reivindicações de Patente

### Reivindicação 1: Sistema Autônomo de Provisionamento
Sistema autônomo de provisionamento de APIs de comunicação baseado em conformidade contratual prévia obrigatória.

### Reivindicação 2: Método de Mitigação de Banimento
Método de mitigação de banimento em plataformas de mensageria via simulação de estados de digitação e gravação com tempos dinâmicos.

### Reivindicação 3: Arquitetura de Gateway de Pagamento
Arquitetura de gateway de pagamento que utiliza conciliação direta via API bancária para isenção de taxas de intermediação.

## 🚀 Serviços

### 1. Session Keeper (Porta 3001)
- **Noise Protocol Framework** para sessões persistentes
- **Sincronização Seletiva** (95% redução de disco)
- **Multi-Device** com QR Code
- **Criptografia** de credenciais em volumes Docker

### 2. Message Queue (Porta 3002)
- **Redis/BullMQ** para filas de alta vazão
- **Backpressure Handling** com cadência segura
- **Conversão Dinâmica** de mídia (FFmpeg)
- **Rate Limiting** configurável

### 3. Anti-Ban Engine (Porta 3003)
- **Taxonomia de Intervalos Variáveis** (1.84s, 3.12s, 2.45s...)
- **Smart Typing Simulation** (45 WPM)
- **Human Wake-up Cycle** (atividades invisíveis)
- **Risk Scoring** em tempo real

### 4. Legal Compliance (Porta 3004)
- **Hashing SHA-256** de contratos
- **Integração ZapSign** para assinatura digital
- **Google Workspace SMTP** (inbox delivery)
- **Webhook** de ativação zero-touch

### 5. Payment Gateway (Porta 3005)
- **Geração de Payload PIX** (Copia e Cola)
- **QR Code Dinâmico**
- **Polling** de confirmação (10s)
- **Zero Chargeback** (PIX irrevogável)

### 6. API Gateway (Porta 8080)
- **118 Endpoints Business**
- **Rate Limiting** e **Slow Down**
- **JWT** e **API Key** authentication
- **Audit Logging** completo

## 📦 Instalação

```bash
# Clone o repositório
git clone https://github.com/facilzap/facil-zap-api.git
cd facil-zap-api

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com suas configurações

# Inicie os serviços
docker-compose up -d

# Verifique os logs
docker-compose logs -f
```

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# Database
DB_USER=facilzap
DB_PASSWORD=secure_password
DB_NAME=facilzap_db

# Redis
REDIS_PASSWORD=redis_password

# Security
ENCRYPTION_KEY=your_32_char_key
JWT_SECRET=your_jwt_secret
API_KEY_SALT=your_salt

# ZapSign
ZAPSIGN_API_KEY=your_zapsign_key
ZAPSIGN_WEBHOOK_SECRET=your_webhook_secret

# Google Workspace
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Banco Inter
BANCO_INTER_CLIENT_ID=your_client_id
BANCO_INTER_CLIENT_SECRET=your_client_secret
BANCO_INTER_CERT_PATH=/app/certs/cert.pem
BANCO_INTER_KEY_PATH=/app/certs/key.pem

# PIX
PIX_KEY=your_pix_key
PIX_MERCHANT_NAME=Your Company
PIX_CITY=Your City
```

## 📚 API Endpoints

### Autenticação
- `POST /v1/auth/register` - Registrar usuário
- `POST /v1/auth/login` - Login
- `POST /v1/auth/api-keys` - Criar API key
- `POST /v1/auth/api-keys/:id/rotate` - Rotacionar API key

### Instâncias
- `POST /v1/instances` - Criar instância
- `GET /v1/instances` - Listar instâncias
- `GET /v1/instances/:id` - Obter instância
- `DELETE /v1/instances/:id` - Deletar instância
- `GET /v1/instances/:id/qr` - Obter QR code
- `GET /v1/instances/:id/metrics` - Métricas da instância
- `GET /v1/instances/:id/logs` - Logs da instância

### Mensagens
- `POST /v1/messages/send` - Enviar mensagem
- `POST /v1/messages/queue` - Enfileirar mensagem
- `POST /v1/messages/bulk` - Envio em massa
- `POST /v1/messages/schedule` - Agendar mensagem
- `GET /v1/messages/status/:jobId` - Status da mensagem

### Grupos
- `GET /v1/groups/:instanceId` - Listar grupos
- `GET /v1/groups/:instanceId/:groupJid` - Info do grupo
- `POST /v1/groups/:instanceId/create` - Criar grupo
- `POST /v1/groups/:instanceId/:groupJid/subject` - Alterar título
- `POST /v1/groups/:instanceId/:groupJid/participants/add` - Adicionar participantes

### Chats
- `GET /v1/chats/:instanceId` - Listar chats
- `POST /v1/chats/:instanceId/:chatId/typing` - Simular digitação
- `POST /v1/chats/:instanceId/:chatId/mark-read` - Marcar como lida
- `POST /v1/chats/:instanceId/:chatId/archive` - Arquivar chat

### Pagamentos
- `POST /v1/payments/invoices` - Criar fatura
- `GET /v1/payments/invoices/:id` - Obter fatura
- `POST /v1/payments/pix/generate` - Gerar PIX
- `GET /v1/payments/pix/status/:txid` - Status do PIX

### Auditoria
- `GET /v1/audit/logs` - Logs de auditoria
- `GET /v1/audit/metrics` - Métricas de auditoria
- `GET /v1/audit/instance/:instanceId/metrics` - Métricas da instância

## 🔒 Anti-Ban 2.0

O algoritmo proprietário implementa:

1. **Intervalos Variáveis**: Distribuição de probabilidade personalizada
2. **Typing Simulation**: Velocidade de 45 WPM com pausas naturais
3. **Human Wake-up**: Ações invisíveis durante horário comercial
4. **Risk Scoring**: Pontuação de risco em tempo real

```typescript
// Exemplo de uso
const delay = antiBanEngine.calculateVariableInterval({
  minIntervalMs: 1500,
  maxIntervalMs: 4500,
});

const typing = antiBanEngine.calculateTypingSimulation(text, {
  typingSimulation: true,
});
```

## 💰 PIX Zero Taxa

Sistema de faturamento direto:

1. **Geração de Payload**: Código "Copia e Cola" conforme BACEN
2. **QR Code Dinâmico**: Imagem base64 para exibição
3. **Polling**: Verificação a cada 10 segundos
4. **Conciliação**: Integração direta com Banco Inter

```typescript
// Exemplo de uso
const pix = pixService.generatePixPayload({
  txid: 'FZ123456',
  amount: 99.90,
  description: 'Assinatura Mensal',
});

const qrCode = await pixService.generateQRCode(pix.payload);
```

## 📜 Compliance Legal

Fluxo de contratos:

1. **Geração**: PDF com hash SHA-256 de integridade
2. **Assinatura**: Integração ZapSign
3. **Notificação**: Email via Google Workspace
4. **Ativação**: Webhook zero-touch

```typescript
// Exemplo de uso
const contract = await contractEngine.generateContractPDF(data);
const hash = contractEngine.generateContractHash(data);
const zapSignDoc = await contractEngine.createZapSignDocument(data, contract);
```

## 📊 Monitoramento

- **Prometheus**: Métricas em `:9090`
- **Grafana**: Dashboards em `:3000`
- **Logs**: Pino com estrutura JSON

## 🤝 Contribuição

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto é proprietário e confidencial. Todos os direitos reservados.

## 📞 Suporte

- Email: suporte@facilzap.com.br
- Documentação: https://docs.facilzap.com.br
- Status: https://status.facilzap.com.br

---

**Facil Zap API** - Automação Inteligente para WhatsApp