import WhatsAppConnection from './WhatsAppConnection';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Facil Zap API
          </h1>
          <p className="text-slate-600 text-lg">
            Painel de Controle - Gerenciamento de Instâncias WhatsApp
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              v2.0.0
            </Badge>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Anti-Ban 2.0
            </Badge>
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">
              PIX Zero
            </Badge>
          </div>
        </div>

        {/* Main Connection Card */}
        <Card className="shadow-xl border-0">
          <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl">Conectar WhatsApp</CardTitle>
            <CardDescription className="text-emerald-100">
              Escaneie o QR Code para conectar sua instância do WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <WhatsAppConnection instanceName="minha-primeira-sessao" />
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">🚀</span>
                Anti-Ban 2.0
              </CardTitle>
              <CardDescription>
                Algoritmo proprietário para evitar bloqueios do WhatsApp
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">📋</span>
                Compliance Legal
              </CardTitle>
              <CardDescription>
                Contratos digitais integrados com ZapSign
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-2xl">💳</span>
                PIX Zero Taxa
              </CardTitle>
              <CardDescription>
                Receba pagamentos via PIX sem taxas
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* API Info */}
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">API Endpoints</CardTitle>
            <CardDescription>
              118 endpoints disponíveis para integração
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <code className="text-blue-600 font-mono">/v1/instances</code>
                <p className="text-slate-600 mt-1">Gerenciar instâncias</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <code className="text-blue-600 font-mono">/v1/messages</code>
                <p className="text-slate-600 mt-1">Enviar mensagens</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <code className="text-blue-600 font-mono">/v1/groups</code>
                <p className="text-slate-600 mt-1">Gerenciar grupos</p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <code className="text-blue-600 font-mono">/v1/webhooks</code>
                <p className="text-slate-600 mt-1">Configurar webhooks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-slate-500 text-sm pt-4">
          <p>© 2026 Facil Zap API. Todos os direitos reservados.</p>
          <p className="mt-1">Microserviços de Automação WhatsApp</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
