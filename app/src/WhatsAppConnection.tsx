import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  RefreshCw, 
  CheckCircle2, 
  Smartphone,
  QrCode,
  AlertTriangle,
  MessageCircle
} from 'lucide-react';

interface SessionData {
  id: string;
  status: string;
  qrCode?: string;
  phoneNumber?: string;
  pushName?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface WhatsAppConnectionProps {
  instanceName: string;
}

export default function WhatsAppConnection({ instanceName }: WhatsAppConnectionProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1';
  const API_KEY = import.meta.env.VITE_API_KEY || '';

  const fetchSessionStatus = async () => {
    if (!API_URL) {
      setError('Configurações de API ausentes no .env');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/instances/${instanceName}`, {
        method: 'GET',
        headers: { 
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setSession(result.data);
        setError('');
      } else if (response.status === 404) {
        await createSession();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Erro ao buscar status da sessão');
      }
    } catch (err) {
      console.error(err);
      setError('Erro de conexão com o servidor da FacilZap API');
    }
  };

  const createSession = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY || ''
        },
        body: JSON.stringify({ name: instanceName })
      });

      if (response.ok) {
        await fetchSessionStatus();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Falha ao criar nova sessão');
      }
    } catch (err) {
      console.error(err);
      setError('Falha na comunicação ao criar sessão');
    } finally {
      setLoading(false);
    }
  };

  const logoutSession = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/instances/${instanceName}/logout`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSession(null);
        await fetchSessionStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionStatus();
    
    const intervalId = setInterval(() => {
      setSession((currentSession) => {
        if (currentSession && currentSession.status !== 'READY') {
          fetchSessionStatus();
        }
        return currentSession;
      });
    }, 3000);

    return () => clearInterval(intervalId);
  }, [instanceName]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
      'DISCONNECTED': { color: 'bg-gray-100 text-gray-800', label: 'Desconectado', icon: <Smartphone className="w-3 h-3" /> },
      'CONNECTING': { color: 'bg-yellow-100 text-yellow-800', label: 'Conectando', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      'QR_READY': { color: 'bg-blue-100 text-blue-800', label: 'QR Code Pronto', icon: <QrCode className="w-3 h-3" /> },
      'AUTHENTICATED': { color: 'bg-purple-100 text-purple-800', label: 'Autenticado', icon: <CheckCircle2 className="w-3 h-3" /> },
      'READY': { color: 'bg-green-100 text-green-800', label: 'Conectado', icon: <CheckCircle2 className="w-3 h-3" /> },
      'ERROR': { color: 'bg-red-100 text-red-800', label: 'Erro', icon: <AlertTriangle className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || statusConfig['DISCONNECTED'];

    return (
      <Badge className={`${config.color} flex items-center gap-1 px-2 py-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (loading && !session) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
        <p className="text-slate-600 font-medium">Iniciando motor do WhatsApp...</p>
        <p className="text-slate-400 text-sm mt-1">Isso pode levar alguns segundos</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3">
          <span>{error}</span>
          <Button 
            onClick={fetchSessionStatus} 
            variant="outline" 
            size="sm"
            className="w-fit"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <MessageCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{instanceName}</h3>
            <p className="text-sm text-slate-500">Instância WhatsApp</p>
          </div>
        </div>
        {session && getStatusBadge(session.status)}
      </div>

      {/* Connection States */}
      {(!session || session.status === 'CONNECTING') && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-200 rounded-full animate-ping opacity-25"></div>
            <div className="relative bg-emerald-100 p-4 rounded-full">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          </div>
          <p className="text-slate-600 mt-4 font-medium">Conectando aos servidores...</p>
          <p className="text-slate-400 text-sm">Gerando seu QR Code</p>
        </div>
      )}

      {session?.status === 'QR_READY' && session.qrCode && (
        <div className="flex flex-col items-center">
          <Card className="p-6 bg-white shadow-lg">
            <QRCodeSVG 
              value={session.qrCode} 
              size={256} 
              level="M" 
              includeMargin={true}
              className="rounded-lg"
            />
          </Card>
          
          <div className="mt-6 text-center max-w-sm">
            <h4 className="font-semibold text-slate-900 mb-2">Como conectar:</h4>
            <ol className="text-sm text-slate-600 space-y-2 text-left">
              <li className="flex items-start gap-2">
                <span className="bg-emerald-100 text-emerald-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                Abra o WhatsApp no seu celular
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-emerald-100 text-emerald-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                Toque em <strong>Mais opções</strong> (⋮) ou <strong>Configurações</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-emerald-100 text-emerald-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                Selecione <strong>Aparelhos Conectados</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-emerald-100 text-emerald-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                Toque em <strong>Conectar um aparelho</strong> e escaneie o código
              </li>
            </ol>
          </div>
        </div>
      )}

      {session?.status === 'READY' && (
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <div className="absolute inset-0 bg-green-200 rounded-full animate-pulse opacity-50"></div>
            <div className="relative bg-green-100 p-6 rounded-full">
              <CheckCircle2 className="w-16 h-16 text-green-600" />
            </div>
          </div>
          
          <h3 className="text-xl font-bold text-green-700 mt-4">
            WhatsApp Conectado!
          </h3>
          
          {session.phoneNumber && (
            <p className="text-slate-600 mt-1">
              Número: <span className="font-mono font-medium">{session.phoneNumber}</span>
            </p>
          )}
          
          {session.pushName && (
            <p className="text-slate-500 text-sm mt-1">
              Nome: {session.pushName}
            </p>
          )}
          
          <p className="text-slate-500 text-sm mt-2 text-center max-w-sm">
            Seu número está vinculado à FacilZap API e pronto para enviar mensagens.
          </p>

          <Button 
            onClick={logoutSession}
            variant="outline"
            className="mt-6 text-red-600 border-red-200 hover:bg-red-50"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Desconectar
          </Button>
        </div>
      )}

      {session?.status === 'DISCONNECTED' && (
        <div className="flex flex-col items-center py-6">
          <div className="bg-gray-100 p-6 rounded-full">
            <Smartphone className="w-16 h-16 text-gray-400" />
          </div>
          
          <h3 className="text-xl font-bold text-gray-700 mt-4">
            Sessão Desconectada
          </h3>
          
          <p className="text-slate-500 text-sm mt-2 text-center max-w-sm">
            A sessão foi desconectada. Clique abaixo para gerar um novo QR Code.
          </p>

          <Button 
            onClick={createSession}
            className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4 mr-2" />
            )}
            Gerar Novo QR Code
          </Button>
        </div>
      )}
    </div>
  );
}
