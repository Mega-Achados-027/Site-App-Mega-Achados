import React, {useState} from 'react';
import {
  Bell,
  Bot,
  Check,
  MessageCircle,
  Play,
  Pause,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import type {BotConfig, ParsedTelegramRule} from '../types.ts';
import {formatBRL} from '../utils/format.ts';

interface BotAutomationViewProps {
  botConfig: BotConfig;
  pushPermission: NotificationPermission | 'unsupported';
  onRequestPushPermission: () => Promise<NotificationPermission | 'unsupported'>;
  onUpdateBotConfig: (patch: Partial<BotConfig>) => Promise<void>;
  onTestWhatsApp: () => Promise<void>;
  onTestPush: () => Promise<void>;
  onImportTelegram: (payload: string) => Promise<{importedCount: number}>;
}

const SAMPLE_TELEGRAM_BOT_PAYLOAD = `[
  {
    "produto": "PlayStation 5 Slim Edição Digital 1TB",
    "min_price": 2700,
    "max_price": 3290,
    "min_discount": 12,
    "categoria": "Games",
    "lojas": ["amazon", "kabum", "magalu"]
  },
  {
    "produto": "SSD NVMe Kingston Fury Renegade 2TB",
    "min_price": 680,
    "max_price": 890,
    "min_discount": 15,
    "categoria": "Hardware",
    "lojas": ["kabum", "amazon", "mercadolivre"]
  },
  {
    "produto": "Apple AirPods Pro 2ª Geração USB-C",
    "min_price": 1250,
    "max_price": 1620,
    "min_discount": 10,
    "categoria": "Áudio",
    "lojas": ["amazon", "mercadolivre", "shopee"]
  }
]`;

export const BotAutomationView: React.FC<BotAutomationViewProps> = ({
  botConfig,
  pushPermission,
  onRequestPushPermission,
  onUpdateBotConfig,
  onTestWhatsApp,
  onTestPush,
  onImportTelegram,
}) => {
  const [phone, setPhone] = useState(botConfig.whatsappPhone);
  const [groupName, setGroupName] = useState(botConfig.whatsappGroupName);
  const [webhookUrl, setWebhookUrl] = useState(botConfig.whatsappWebhookUrl);
  const [template, setTemplate] = useState(botConfig.whatsappTemplate);
  const [scanInterval, setScanInterval] = useState(String(botConfig.scanIntervalSec));
  const [autoDispatchWA, setAutoDispatchWA] = useState(botConfig.autoDispatchWhatsApp);

  const [pushEnabled, setPushEnabled] = useState(botConfig.pushEnabled);
  const [pushMinDiscount, setPushMinDiscount] = useState(String(botConfig.pushMinDiscount));
  const [quietStart, setQuietStart] = useState(botConfig.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState(botConfig.quietHoursEnd);

  const [savingConfig, setSavingConfig] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [testingWA, setTestingWA] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const [telegramPayload, setTelegramPayload] = useState('');
  const [previewRules, setPreviewRules] = useState<ParsedTelegramRule[]>([]);
  const [parsingTg, setParsingTg] = useState(false);
  const [importingTg, setImportingTg] = useState(false);
  const [tgResultMsg, setTgResultMsg] = useState<string | null>(null);
  const [tgErrorMsg, setTgErrorMsg] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await onUpdateBotConfig({
        whatsappPhone: phone.trim(),
        whatsappGroupName: groupName.trim(),
        whatsappWebhookUrl: webhookUrl.trim(),
        whatsappTemplate: template,
        scanIntervalSec: Number(scanInterval) || 20,
        autoDispatchWhatsApp: autoDispatchWA,
        pushEnabled,
        pushMinDiscount: Number(pushMinDiscount) || 8,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
      });
      setSavedBanner(true);
      window.setTimeout(() => setSavedBanner(false), 2400);
    } finally {
      setSavingConfig(false);
    }
  };

  const handlePreviewTelegram = async (textOverride?: string) => {
    const content = textOverride !== undefined ? textOverride : telegramPayload;
    if (!content.trim()) {
      setPreviewRules([]);
      return;
    }
    setParsingTg(true);
    setTgErrorMsg(null);
    setTgResultMsg(null);
    try {
      const resp = await fetch('/api/telegram/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({payload: content}),
      });
      const data = (await resp.json()) as {rules: ParsedTelegramRule[]};
      setPreviewRules(data.rules || []);
      if (!data.rules || data.rules.length === 0) {
        setTgErrorMsg('Nenhuma regra reconhecida. Use JSON ou comandos como "/monitorar Produto 1200-1500 amazon,kabum".');
      }
    } catch {
      setTgErrorMsg('Erro ao analisar a configuração do bot do Telegram.');
    } finally {
      setParsingTg(false);
    }
  };

  const handleConfirmImportTelegram = async () => {
    if (!telegramPayload.trim()) return;
    setImportingTg(true);
    setTgErrorMsg(null);
    try {
      const res = await onImportTelegram(telegramPayload);
      setTgResultMsg(
        `${res.importedCount} ${res.importedCount === 1 ? 'regra migrada' : 'regras migradas'} do Telegram para o Mega Achados 027 (WhatsApp + Push) com sucesso.`,
      );
      setTelegramPayload('');
      setPreviewRules([]);
    } catch (err) {
      setTgErrorMsg(err instanceof Error ? err.message : 'Erro ao importar regras.');
    } finally {
      setImportingTg(false);
    }
  };

  const insertVariable = (variable: string) => {
    setTemplate((prev) => `${prev} ${variable}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Mega Achados 027 · WhatsApp, Push & Telegram
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Configure o motor de monitoramento automático, disparos para WhatsApp com seu link de afiliado, notificações push e importe sua lógica pronta do Telegram.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onUpdateBotConfig({enabled: !botConfig.enabled})}
          className={`min-h-[42px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
            botConfig.enabled
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:opacity-90'
          }`}
        >
          {botConfig.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{botConfig.enabled ? 'Robô Ativo (Pausar)' : 'Robô Pausado (Ativar)'}</span>
        </button>
      </div>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* WhatsApp Dispatch Config */}
        <section className="xl:col-span-7 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                Integração WhatsApp Exclusiva
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Define número ou grupo destino, webhook da API WhatsApp (opcional) e o modelo de mensagem com {'{link}'} de afiliado.
              </p>
            </div>
            <button
              type="button"
              disabled={testingWA}
              onClick={async () => {
                setTestingWA(true);
                try {
                  await onTestWhatsApp();
                } finally {
                  setTestingWA(false);
                }
              }}
              className="min-h-[36px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              {testingWA ? 'Testando...' : 'Disparar Teste'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Número WhatsApp (com DDI/DDD)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55 27 99999-9999"
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Nome do Grupo / Lista de Transmissão
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Grupo VIP Mega Achados 027"
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Webhook WhatsApp Cloud / Evolution / Z-API (opcional)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.seusistema.com/whatsapp/send"
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Intervalo de Varredura
              </label>
              <select
                value={scanInterval}
                onChange={(e) => setScanInterval(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              >
                <option value="10">A cada 10 seg</option>
                <option value="20">A cada 20 seg</option>
                <option value="60">A cada 1 min</option>
                <option value="300">A cada 5 min</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Modelo da Mensagem WhatsApp (insere seu afiliado em {'{link}'})
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {['{produto}', '{loja}', '{preco}', '{desconto}', '{link}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-yellow-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDispatchWA}
              onChange={(e) => setAutoDispatchWA(e.target.checked)}
              className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
            />
            <span>Enfileirar e disparar automaticamente quando um produto atingir a faixa de preço alvo</span>
          </label>
        </section>

        {/* Real-Time Push Notifications Config */}
        <section className="xl:col-span-5 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                Notificações Push em Tempo Real
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Receba alertas nativos no celular ou navegador mesmo em segundo plano.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-950 dark:text-white">
                  Permissão do Navegador / App
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {pushPermission === 'granted'
                    ? 'Autorizado — notificações push nativas ativas'
                    : pushPermission === 'denied'
                      ? 'Bloqueado nas configurações do navegador'
                      : pushPermission === 'unsupported'
                        ? 'Notificações nativas indisponíveis neste navegador (alertas no app continuam ativos)'
                        : 'Clique para autorizar alertas nativos em tempo real'}
                </p>
              </div>
              {pushPermission !== 'granted' && pushPermission !== 'unsupported' ? (
                <button
                  type="button"
                  onClick={() => void onRequestPushPermission()}
                  className="min-h-[38px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Ativar Push
                </button>
              ) : (
                <button
                  type="button"
                  disabled={testingPush}
                  onClick={async () => {
                    setTestingPush(true);
                    try {
                      await onTestPush();
                    } finally {
                      setTestingPush(false);
                    }
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
                >
                  {testingPush ? 'Enviando...' : 'Testar Push'}
                </button>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
              />
              <span>Habilitar alertas push personalizados em tempo real</span>
            </label>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Desconto mínimo para disparar Push (%)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={pushMinDiscount}
                onChange={(e) => setPushMinDiscount(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Silenciar a partir de
                </label>
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Retomar alertas às
                </label>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
            {savedBanner ? (
              <span className="text-xs font-medium text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1">
                <Check className="w-4 h-4" />
                Configurações salvas
              </span>
            ) : (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Sincronizado em tempo real
              </span>
            )}
            <button
              type="submit"
              disabled={savingConfig}
              className="min-h-[42px] px-5 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{savingConfig ? 'Salvando...' : 'Salvar Automação'}</span>
            </button>
          </div>
        </section>
      </form>

      {/* Telegram Bot Migration Assistant */}
      <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              Migrar Lógica do Seu Bot do Telegram
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Cole abaixo o JSON de produtos, comandos do Telegram (<code className="font-mono">/monitorar Produto 1200-1800 amazon,kabum</code>) ou lista de alertas do seu bot atual. O conversor importa automaticamente faixas de preço e lojas para o Mega Achados 027.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {botConfig.telegramImportedCount > 0 && (
              <span className="text-xs text-amber-700 dark:text-yellow-400 font-medium font-mono-num">
                {botConfig.telegramImportedCount} importados
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setTelegramPayload(SAMPLE_TELEGRAM_BOT_PAYLOAD);
                void handlePreviewTelegram(SAMPLE_TELEGRAM_BOT_PAYLOAD);
              }}
              className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
            >
              Carregar Exemplo Telegram
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 space-y-3">
            <textarea
              rows={8}
              value={telegramPayload}
              onChange={(e) => setTelegramPayload(e.target.value)}
              placeholder={`Cole JSON do bot Telegram ou comandos:\n/monitorar Placa RTX 4060 Ti | 2100-2550 | kabum,amazon\n/add Notebook Dell Inspiron 2800-3400 amazon,magalu`}
              className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={parsingTg || !telegramPayload.trim()}
                onClick={() => void handlePreviewTelegram()}
                className="min-h-[40px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Bot className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                <span>{parsingTg ? 'Analisando...' : 'Analisar Regras'}</span>
              </button>
              <button
                type="button"
                disabled={importingTg || !telegramPayload.trim()}
                onClick={() => void handleConfirmImportTelegram()}
                className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>{importingTg ? 'Migrando...' : 'Migrar para WhatsApp + App'}</span>
              </button>
            </div>
            {tgResultMsg && (
              <p className="text-xs font-medium text-amber-700 dark:text-yellow-400">
                {tgResultMsg}
              </p>
            )}
            {tgErrorMsg && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{tgErrorMsg}</p>
            )}
          </div>

          <div className="lg:col-span-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0B0C10] p-4">
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-3">
              Prévia das Regras Detectadas ({previewRules.length})
            </h3>
            {previewRules.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Cole o conteúdo do seu bot do Telegram à esquerda e clique em{' '}
                <strong>Analisar Regras</strong> para inspecionar os produtos, faixas de preço e lojas antes de concluir a migração.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800 max-h-56 overflow-y-auto">
                {previewRules.map((rule, idx) => (
                  <div key={`${rule.name}-${idx}`} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-950 dark:text-white truncate">
                        {rule.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {rule.sourceFormat} · Lojas: {rule.storeIds.join(', ')}
                      </p>
                    </div>
                    <div className="text-right font-mono-num shrink-0">
                      <p className="font-semibold text-amber-700 dark:text-yellow-400">
                        {formatBRL(rule.targetMinPrice)} – {formatBRL(rule.targetMaxPrice)}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Desc. mín. {rule.minDiscountPercent}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
