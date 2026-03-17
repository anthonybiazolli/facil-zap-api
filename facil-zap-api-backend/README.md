# Facil Zap API v2.0

Microserviços de Automação WhatsApp com Anti-Ban 2.0, Compliance Legal Automático e PIX Zero Taxa.

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

## 📋 Requisitos

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (para desenvolvimento local)

## 🚀 Início Rápido

1. Clone o repositório:
```bash
git clone https://github.com/facilzap/facil-zap-api.git
cd facil-zap-api/backend
```

2. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

3. Inicie os serviços:
```bash
docker-compose up --build
```

4. Acesse a API:
- API Gateway: http://localhost:3000
- Documentação: http://localhost:3000/docs

## 📦 Serviços

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| API Gateway | 3000 | Ponto de entrada único para todos os endpoints |
| Session Keeper | 3001 | Gerenciamento de sessões WhatsApp |
| Message Queue | 3002 | Fila de mensagens com BullMQ |
| Anti-Ban Engine | 3003 | Algoritmo Anti-Ban 2.0 |
| Legal Compliance | 3004 | Contratos digitais com ZapSign |
| Payment Gateway | 3005 | Pagamentos PIX |
| PostgreSQL | 5432 | Banco de dados principal |
| Redis | 6379 | Cache e filas |
| MongoDB | 27017 | Analytics |
| MinIO | 9000 | Armazenamento de arquivos |

## 🔑 Endpoints Principais

### Autenticação
- `POST /v1/auth/register` - Registrar novo usuário
- `POST /v1/auth/login` - Login
- `POST /v1/auth/api-keys` - Criar chave de API

### Instâncias
- `POST /v1/instances` - Criar instância
- `GET /v1/instances` - Listar instâncias
- `GET /v1/instances/:id` - Obter instância
- `DELETE /v1/instances/:id` - Deletar instância
- `GET /v1/instances/:id/qr` - Obter QR Code

### Mensagens
- `POST /v1/messages/send` - Enviar mensagem
- `POST /v1/messages/queue` - Enfileirar mensagem
- `POST /v1/messages/bulk` - Envio em massa
- `POST /v1/messages/schedule` - Agendar mensagem

## 🛡️ Anti-Ban 2.0

O algoritmo proprietário inclui:

- Intervalos variáveis entre mensagens
- Simulação de digitação
- Ciclo de "wake-up" humanizado
- Análise de risco em tempo real
- Recomendações automáticas

## 📜 Compliance Legal

Integração com ZapSign para:

- Contratos digitais
- Assinatura eletrônica
- Hash de integridade
- Validação legal

## 💳 PIX Zero Taxa

- Geração de QR Code
- Payload Copia e Cola
- Webhooks de confirmação
- Reconciliação bancária

## 📄 Licença

PROPRIETÁRIA - Todos os direitos reservados

## 🤝 Suporte

Para suporte, entre em contato: suporte@facilzap.com.br
