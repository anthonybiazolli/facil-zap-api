import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface SessionData {
  id: string;
  status: string;
  qrCode?: string;
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

  const API_URL = import.meta.env.VITE_API_URL;
  const API_KEY = import.meta.env.VITE_API_KEY;

  const fetchSessionStatus = async () => {
    if (!API_URL || !API_KEY) {
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
        body: JSON.stringify({ instanceName })
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

  if (loading && !session) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '400px', margin: '2rem auto' }}>
        <p>Iniciando motor do WhatsApp...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #ffcccc', backgroundColor: '#fff5f5', borderRadius: '8px', maxWidth: '400px', margin: '2rem auto' }}>
        <p style={{ fontSize: '2rem', margin: 0 }}>⚠️</p>
        <p style={{ color: '#cc0000', fontWeight: 'bold' }}>{error}</p>
        <button onClick={fetchSessionStatus} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Tentar Novamente</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', border: '1px solid #eee', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '400px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>Conectar WhatsApp</h2>
      
      {(!session || session.status === 'CONNECTING') && (
        <div>
          <p style={{ color: '#666' }}>Conectando aos servidores...<br/>Gerando seu QR Code.</p>
        </div>
      )}

      {session?.status === 'QR_READY' && session.qrCode && (
        <div>
          <div style={{ padding: '1rem', background: '#fff', display: 'inline-block', borderRadius: '8px', border: '1px solid #ddd' }}>
            <QRCodeSVG value={session.qrCode} size={256} level="M" includeMargin={true} />
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555' }}>
            Abra o WhatsApp no seu celular, vá em <strong>Aparelhos Conectados</strong> e escaneie este código.
          </p>
        </div>
      )}

      {session?.status === 'READY' && (
        <div>
          <p style={{ fontSize: '3rem', margin: '0 0 1rem 0' }}>✅</p>
          <h3 style={{ color: '#2e7d32', margin: 0 }}>WhatsApp Conectado!</h3>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>Seu número está vinculado à FacilZap API.</p>
        </div>
      )}
      
      {session?.status === 'DISCONNECTED' && (
        <div>
          <p style={{ fontSize: '3rem', margin: '0 0 1rem 0' }}>📵</p>
          <h3 style={{ color: '#c62828', margin: 0 }}>Sessão Desconectada</h3>
          <button onClick={createSession} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Gerar Novo QR Code</button>
        </div>
      )}
    </div>
  );
}