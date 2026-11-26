import React from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, errorMessage: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado no aplicativo.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'Ocorreu um erro ao carregar os dados. Recarregue para continuar.';
      if (this.state.errorMessage.includes('Quota exceeded')) {
        friendly = 'Limite diário do banco de dados atingido. O limite será renovado amanhã.';
      } else if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendly = 'Sua sessão não tem permissão para esta operação. Faça login novamente.';
      }

      return (
        <div className="min-h-screen bg-[#07070A] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#13141A] border border-zinc-800 p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold">Mega Achados 027</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[42px] px-5 rounded-xl bg-yellow-400 text-zinc-950 text-xs font-bold inline-flex items-center gap-2 hover:bg-yellow-300 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Recarregar Aplicativo</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
