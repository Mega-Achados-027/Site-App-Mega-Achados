import React, {useState} from 'react';
import {Download, ShieldCheck, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
  hideLabelOnSmall?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  hideLabelOnSmall = false,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={isIOS ? 'Instalar aplicativo no iPhone' : 'Instalar aplicativo'}
        title={isIOS ? 'Instalar no iPhone' : 'Instalar App'}
        className={`flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0B0C10] text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
          compact
            ? hideLabelOnSmall
              ? 'px-2.5 sm:px-3 py-1.5 text-xs font-semibold'
              : 'px-3 py-2 text-xs font-medium'
            : 'w-full min-h-[40px] px-4 py-2.5 text-sm font-medium'
        }`}
      >
        {isIOS ? (
          <Smartphone className="w-4 h-4 text-red-600 dark:text-yellow-400 shrink-0" />
        ) : (
          <Download className="w-4 h-4 text-red-600 dark:text-yellow-400 shrink-0" />
        )}
        <span className={hideLabelOnSmall ? 'hidden sm:inline' : ''}>
          {isIOS ? 'Instalar no iPhone' : 'Instalar App'}
        </span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  Instalar Mega Achados 027
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Instalação oficial pelo navegador — sem avisos do Google Play Protect e com o app salvo na sua gaveta de aplicativos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Fechar"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                100% verificado pelo navegador (WebAPK oficial) — não exige fontes desconhecidas.
              </span>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <li>
                  1. Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari.
                </li>
                <li>
                  2. Role as opções e selecione <strong>Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  3. Toque em <strong>Adicionar</strong> no canto superior direito.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <li>
                  1. Toque no menu do navegador (<strong>⋮</strong> no canto superior ou inferior).
                </li>
                <li>
                  2. Selecione <strong>Instalar aplicativo</strong> (no Chrome/Edge/Brave ele instala como app oficial na gaveta de apps).
                </li>
                <li>
                  3. Se aparecer um ícone na tela inicial e você não quiser lá, basta segurar e tocar em <strong>Remover da tela inicial</strong> — o app continua instalado na gaveta normalmente.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
