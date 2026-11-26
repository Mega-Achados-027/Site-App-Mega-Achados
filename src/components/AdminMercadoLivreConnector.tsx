import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlink,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext.tsx';

interface MlSessionStatus {
  connected: boolean;
  verified: boolean;
  tag: string;
  hasCsrfToken: boolean;
  persistedEncrypted: boolean;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
  lastGeneratedShortUrl: string | null;
  lastError: string | null;
  cachedLinksCount: number;
}

interface GeneratedLinkItem {
  originalUrl: string;
  shortUrl: string | null;
  longUrl: string | null;
  ok: boolean;
  cached?: boolean;
  error?: string;
}

function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const AdminMercadoLivreConnector: React.FC = () => {
  const {isAdmin, getAdminAuthHeaders} = useAuth();
  const [status, setStatus] = useState<MlSessionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [tagInput, setTagInput] = useState('mh20241004134402');
  const [sessionInput, setSessionInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error'; text: string} | null>(null);

  const [urlsText, setUrlsText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<GeneratedLinkItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [syncingDeals, setSyncingDeals] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStatus(true);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/mercadolivre-session', {headers});
      if (res.ok) {
        const data = (await res.json()) as MlSessionStatus;
        setStatus(data);
        if (data.tag) {
          setTagInput(data.tag);
        }
      }
    } catch {
      // Ignore transient load error
    } finally {
      setLoadingStatus(false);
    }
  }, [isAdmin, getAdminAuthHeaders]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!isAdmin) {
    return null;
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionInput.trim()) {
      setFeedback({
        type: 'error',
        text: 'Cole o comando "Copy as cURL" do createLink ou o cabeçalho Cookie da sua conta logada no Mercado Livre.',
      });
      return;
    }

    setConnecting(true);
    setFeedback(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/mercadolivre-session', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawInput: sessionInput.trim(),
          tag: tagInput.trim() || 'mh20241004134402',
          verifyNow: true,
        }),
      });
      const data = (await res.json()) as {
        status?: MlSessionStatus;
        verified?: boolean;
        testShortUrl?: string | null;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Não foi possível salvar a sessão do Mercado Livre.',
        });
        return;
      }

      if (data.status) {
        setStatus(data.status);
      }
      // Clear raw credentials from browser memory immediately after saving server-side
      setSessionInput('');

      if (data.verified && data.testShortUrl) {
        setFeedback({
          type: 'success',
          text: `Conta conectada e validada! Link oficial de teste gerado: ${data.testShortUrl}`,
        });
      } else {
        setFeedback({
          type: 'error',
          text:
            data.message ||
            'Sessão salva, mas o Mercado Livre recusou o teste automático (cookie expirado ou faltando x-csrf-token). Tente copiar o cURL direto da requisição createLink.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Erro de conexão ao validar a sessão do Mercado Livre.',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setFeedback(null);
    setSyncMessage(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/mercadolivre-session', {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as {status?: MlSessionStatus};
        if (data.status) {
          setStatus(data.status);
        }
        setFeedback({
          type: 'success',
          text: 'Sessão do Mercado Livre desconectada e removida do servidor.',
        });
      }
    } finally {
      setDisconnecting(false);
    }
  };

  const handleGenerateLinks = async () => {
    const lines = urlsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Cole pelo menos 1 URL de produto do Mercado Livre (uma por linha).',
      });
      return;
    }

    setGenerating(true);
    setFeedback(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/mercadolivre-session/generate', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({urls: lines}),
      });
      const data = (await res.json()) as {
        results?: GeneratedLinkItem[];
        status?: MlSessionStatus;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Falha ao gerar links no Mercado Livre.',
        });
        return;
      }
      setGeneratedResults(data.results || []);
      if (data.status) {
        setStatus(data.status);
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Erro de rede ao gerar links no Mercado Livre.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSyncAllMlDeals = async () => {
    setSyncingDeals(true);
    setSyncMessage(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/mercadolivre-session/sync-deals', {
        method: 'POST',
        headers,
      });
      const data = (await res.json()) as {
        convertedCount?: number;
        totalChecked?: number;
        status?: MlSessionStatus;
        error?: string;
      };
      if (!res.ok) {
        setSyncMessage(data.error || 'Não foi possível converter as ofertas agora.');
        return;
      }
      if (data.status) {
        setStatus(data.status);
      }
      setSyncMessage(
        data.totalChecked === 0
          ? 'Nenhuma oferta do Mercado Livre pendente de conversão no momento. As próximas já serão convertidas automaticamente.'
          : `Pronto! ${data.convertedCount ?? 0} de ${data.totalChecked ?? 0} oferta(s) do Mercado Livre convertidas para links oficiais meli.la.`,
      );
    } catch {
      setSyncMessage('Erro ao sincronizar ofertas do Mercado Livre.');
    } finally {
      setSyncingDeals(false);
    }
  };

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const successfulShortLinks = generatedResults
    .map((r) => r.shortUrl)
    .filter((u): u is string => Boolean(u));

  return (
    <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-amber-300/80 dark:border-yellow-500/35 overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-4 bg-amber-50/70 dark:bg-yellow-400/5 border-b border-amber-200/80 dark:border-yellow-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-yellow-400 text-zinc-950 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Gerador Oficial Mercado Livre (meli.la) — Modo Administrador
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                  status?.connected && status?.verified
                    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                    : status?.connected
                      ? 'bg-amber-100 dark:bg-yellow-500/15 text-amber-800 dark:text-yellow-300'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {loadingStatus ? (
                  'Verificando...'
                ) : status?.connected && status?.verified ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Conectado ({status.tag})
                  </>
                ) : status?.connected ? (
                  'Sessão salva (aguardando validação)'
                ) : (
                  'Não conectado'
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Conecte a sessão da sua conta do Mercado Livre para gerar links oficiais{' '}
              <span className="font-mono text-zinc-900 dark:text-yellow-300">https://meli.la/...</span>{' '}
              com <span className="font-mono">ref=</span> válido direto no site e nas promoções automáticas.
            </p>
          </div>
        </div>

        <a
          href="https://www.mercadolivre.com.br/afiliados/linkbuilder"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[38px] px-3.5 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        >
          <span>Abrir Portal Mercado Livre</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connect ML Account Session */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Como conectar sua conta em 30 segundos (sem digitar sua senha aqui)
            </p>
            <ol className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              <li>
                <strong className="text-zinc-900 dark:text-yellow-400">1.</strong> Clique em{' '}
                <strong>Abrir Portal Mercado Livre</strong> acima e faça login normalmente no site oficial.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-yellow-400">2.</strong> No Gerador de Links, aperte{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-[11px]">F12</kbd>{' '}
                → aba <strong>Rede (Network)</strong> → clique em <strong>Gerar</strong> em 1 produto qualquer.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-yellow-400">3.</strong> Clique com o botão direito na chamada{' '}
                <span className="font-mono text-amber-700 dark:text-yellow-400">createLink</span> →{' '}
                <strong>Copiar → Copiar como cURL</strong> (ou copie apenas o valor do cabeçalho{' '}
                <span className="font-mono">Cookie</span>) e cole abaixo.
              </li>
            </ol>
          </div>

          <form onSubmit={handleConnect} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Etiqueta de Afiliado (tag)
                </label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="mh20241004134402"
                  className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="min-h-[38px] px-3 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Links meli.la em cache</span>
                  <strong className="font-mono-num text-zinc-900 dark:text-yellow-400">
                    {status?.cachedLinksCount ?? 0}
                  </strong>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sessão do Mercado Livre (cole &quot;Copiar como cURL&quot; ou Cookie)
              </label>
              <textarea
                rows={4}
                value={sessionInput}
                onChange={(e) => setSessionInput(e.target.value)}
                placeholder="Cole aqui o comando curl 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink' ... ou sua string Cookie: ssid=...; _csrf=..."
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                A sessão fica guardada apenas no servidor (criptografada) e nunca é exibida para clientes do site.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={connecting}
                className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Conectando e testando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{status?.connected ? 'Atualizar Sessão & Testar' : 'Conectar & Testar Agora'}</span>
                  </>
                )}
              </button>

              {status?.connected && (
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={() => void handleDisconnect()}
                  className="min-h-[40px] px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>{disconnecting ? 'Desconectando...' : 'Desconectar'}</span>
                </button>
              )}
            </div>
          </form>

          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="break-all">{feedback.text}</span>
            </div>
          )}

          {status?.lastError && !feedback && (
            <div className="p-3 rounded-xl border bg-amber-50 dark:bg-yellow-500/10 border-amber-200 dark:border-yellow-500/30 text-xs text-amber-800 dark:text-yellow-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Último aviso da sessão: {status.lastError}</span>
            </div>
          )}
        </div>

        {/* Right Column: Instant meli.la Link Generator & Deal Converter */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-4 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                Gerador de Links Oficiais (meli.la)
              </h3>
              {status?.lastGeneratedShortUrl && isSafeHttpsUrl(status.lastGeneratedShortUrl) && (
                <a
                  href={status.lastGeneratedShortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-amber-700 dark:text-yellow-400 hover:underline truncate max-w-[180px]"
                >
                  Último: {status.lastGeneratedShortUrl}
                </a>
              )}
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Cole 1 ou mais URLs de produtos do Mercado Livre (uma por linha) para gerar links curtos{' '}
              <span className="font-mono text-zinc-900 dark:text-zinc-200">https://meli.la/...</span>{' '}
              oficiais da sua conta.
            </p>

            <textarea
              rows={4}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder={`https://www.mercadolivre.com.br/p/MLB18917848\nhttps://produto.mercadolivre.com.br/MLB-...`}
              className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={generating || !status?.connected}
                onClick={() => void handleGenerateLinks()}
                className="min-h-[38px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gerando meli.la...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Gerar Links meli.la</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={syncingDeals || !status?.connected}
                onClick={() => void handleSyncAllMlDeals()}
                className="min-h-[38px] px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 disabled:opacity-50 hover:border-amber-400 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingDeals ? 'animate-spin' : ''}`} />
                <span>{syncingDeals ? 'Convertendo ofertas...' : 'Converter Ofertas do Site'}</span>
              </button>
            </div>

            {syncMessage && (
              <p className="text-xs text-amber-700 dark:text-yellow-400 leading-relaxed">{syncMessage}</p>
            )}

            {generatedResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    Links gerados ({generatedResults.length})
                  </span>
                  {successfulShortLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleCopyText('all', successfulShortLinks.join('\n'))}
                      className="text-[11px] font-medium text-red-600 dark:text-yellow-400 hover:underline inline-flex items-center gap-1"
                    >
                      {copiedKey === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'all' ? 'Todos copiados' : 'Copiar todos'}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                  {generatedResults.map((item, idx) => (
                    <div
                      key={`${item.originalUrl}-${idx}`}
                      className="p-2.5 rounded-lg bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 space-y-1"
                    >
                      <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                        {item.originalUrl}
                      </p>
                      {item.ok && item.shortUrl && isSafeHttpsUrl(item.shortUrl) ? (
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={item.shortUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono font-semibold text-amber-700 dark:text-yellow-400 hover:underline truncate"
                          >
                            {item.shortUrl}
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopyText(`res-${idx}`, item.shortUrl as string)}
                            className="shrink-0 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1"
                          >
                            {copiedKey === `res-${idx}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-red-600 dark:text-red-400">
                          {item.error || 'Não foi possível gerar link para esta URL.'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
            Enquanto conectado, novas promoções do Mercado Livre descobertas pelo Radar também tentam gerar{' '}
            <span className="font-mono">meli.la</span> automaticamente (e mantêm{' '}
            <span className="font-mono">matt_word + matt_tool</span> como garantia se a sessão expirar).
          </p>
        </div>
      </div>
    </section>
  );
};
