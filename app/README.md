# Facil Zap Web

Frontend React + TypeScript + Vite para a Facil Zap API.

## 🚀 Tecnologias

- React 19
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- QRCode.react

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn

## 🔧 Instalação

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

## 🏗️ Build

```bash
npm run build
```

## 🐳 Docker

```bash
docker-compose up --build
```

## 📁 Estrutura

```
src/
├── components/     # Componentes reutilizáveis
├── App.tsx        # Componente principal
├── WhatsAppConnection.tsx  # Componente de conexão WhatsApp
├── main.tsx       # Entry point
└── index.css      # Estilos globais
```

## 🔗 Integração com API

O frontend se comunica com a API Gateway através das variáveis de ambiente:

- `VITE_API_URL` - URL base da API
- `VITE_API_KEY` - Chave de API para autenticação

## 📄 Licença

PROPRIETÁRIA - Todos os direitos reservados
