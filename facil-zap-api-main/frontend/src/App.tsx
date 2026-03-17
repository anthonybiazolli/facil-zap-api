import React from 'react';
import WhatsAppConnection from './WhatsAppConnection';

function App() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center', fontFamily: 'sans-serif', color: '#333' }}>
        Painel do Cliente - Facil Zap
      </h1>
      
      {/* Aqui chamamos o componente passando o nome da sessão que você criou */}
      <WhatsAppConnection instanceName="minha-primeira-sessao" />
    </div>
  );
}

export default App;