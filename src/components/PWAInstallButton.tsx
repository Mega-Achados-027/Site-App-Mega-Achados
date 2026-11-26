import React, {useState} from 'react';
import {CheckCircle2, Download, ShieldCheck, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
  hideLabelOnSmall?: boolean;
}

const APK_DOWNLOAD_URL = '/api/download/mega-achados-027.apk';
const APK_FILENAME = 'Mega-Achados-027.apk';

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  hideLabelOnSmall = false,
}) => {
  const {isInstalled, isIOS} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  if (isInstalled) {
    return null;
  }

  const triggerApkDownload = () => {
    const link = document.createElement('a');
    link.href = APK_DOWNLOAD_URL;
    link.download = APK_FILENAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadStarted(true);
  };

  const handleClick = () => {
    if (isIOS) {
      setShowGuide(true);
      return;
    }
    triggerApkDownload();
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={isIOS ? 'Instalar aplicativo no iPhone' : 'Baixar aplicativo Android (.apk)'}
        title={isIOS ? 'Instalar no iPhone' : 'Baixar App Android (.apk)'}
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
          {isIOS ? 'Instalar no iPhone' : 'Instalar APK'}
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
                  {isIOS ? 'Instalar no iPhone' : 'App Android (.apk) — Mega Achados 027'}
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {isIOS
                    ? 'O iPhone não instala arquivos .apk, mas você pode adicionar o app pelo Safari.'
                    : 'Aplicativo nativo real para Android — fica na sua gaveta de apps sem precisar deixar atalho na tela inicial.'}
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

            {isIOS ? (
              <>
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
                <a
                  href={APK_DOWNLOAD_URL}
                  download={APK_FILENAME}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar arquivo .apk para Android
                </a>
              </>
            ) : (
              <>
                {downloadStarted && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Download de <strong>{APK_FILENAME}</strong> iniciado automaticamente!
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <ShieldCheck className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span>
                    Compatível com <strong>Android 7 até Android 16</strong> (assinatura v2 verificada).
                  </span>
                </div>

                <ol className="mt-4 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <li>
                    1. Abra o arquivo <strong>{APK_FILENAME}</strong> na barra de notificações ou na pasta <strong>Downloads</strong>.
                  </li>
                  <li>
                    2. Se o Android pedir autorização, toque em <strong>Configurações</strong> e ative <strong>Permitir desta fonte</strong>.
                  </li>
                  <li>
                    3. Toque em <strong>Instalar</strong>. O aplicativo será instalado na gaveta de apps normalmente.
                  </li>
                </ol>

                <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
                  <a
                    href={APK_DOWNLOAD_URL}
                    download={APK_FILENAME}
                    onClick={() => setDownloadStarted(true)}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors px-4"
                  >
                    <Download className="w-4 h-4" />
                    Baixar APK novamente
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

            {isIOS && (
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Entendi
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
