import React, {useMemo, useState} from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  MessageCircle,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type {AlertNotification, BotConfig} from '../types.ts';
import {buildWhatsAppDeepLink} from '../utils/affiliate.ts';
import {formatBRL, formatDateTime, formatRelativeTime} from '../utils/format.ts';

interface AlertsInboxViewProps {
  alerts: AlertNotification[];
  botConfig: BotConfig;
  onMarkRead: (alertId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onMarkPurchased: (alertId: string) => Promise<void>;
  onTestWhatsApp: () => Promise<void>;
}

type AlertFilter = 'all' | 'unread' | 'whatsapp' | 'purchased';

export const AlertsInboxView: React.FC<AlertsInboxViewProps> = ({
  alerts,
  botConfig,
  onMarkRead,
  onMarkAllRead,
  onMarkPurchased,
  onTestWhatsApp,
}) => {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread':
        return alerts.filter((a) => !a.read);
      case 'whatsapp':
        return alerts.filter((a) => a.channels.includes('whatsapp'));
      case 'purchased':
        return alerts.filter((a) => a.purchased);
      default:
        return alerts;
    }
  }, [alerts, filter]);

  const handleTest = async () => {
    setSendingTest(true);
    try {
      await onTestWhatsApp();
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Central de Alertas em Tempo Real
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Todos os disparos de queda de preço do Mega Achados 027 para WhatsApp e notificações push com seu link de afiliado pronto.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTest}
            disabled={sendingTest}
            className="min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
            <span>{sendingTest ? 'Disparando...' : 'Testar Alerta WhatsApp'}</span>
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="min-h-[40px] px-3.5 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todos lidos ({unreadCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-zinc-200/80 dark:bg-[#13141A] border border-transparent dark:border-zinc-800">
        {(
          [
            {id: 'all', label: `Todos (${alerts.length})`},
            {id: 'unread', label: `Não lidos (${unreadCount})`},
            {id: 'whatsapp', label: 'WhatsApp'},
            {id: 'purchased', label: 'Comprados'},
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[34px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              filter === tab.id
                ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto" />
            <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nenhum alerta nesta categoria
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Quando um produto entrar na sua faixa de preço configurada, o alerta aparecerá aqui automaticamente.
            </p>
          </div>
        ) : (
          filtered.map((alert) => {
            const waLink = buildWhatsAppDeepLink(botConfig.whatsappPhone, alert.whatsappMessage);
            const isExpanded = expandedId === alert.id;
            const potentialSaving = Math.max(0, alert.oldPrice - alert.newPrice);

            return (
              <div
                key={alert.id}
                className={`p-5 transition-colors ${
                  !alert.read ? 'bg-amber-50/40 dark:bg-yellow-400/[0.04]' : ''
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                        {alert.storeName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(alert.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Canais: {alert.channels.map((c) => (c === 'whatsapp' ? 'WhatsApp' : c === 'push' ? 'Push' : 'Painel')).join(', ')}
                      </span>
                      {alert.whatsappStatus === 'webhook_sent' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700 dark:text-yellow-400 font-medium">
                            Webhook enviado
                          </span>
                        </>
                      )}
                      {alert.purchased && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700 dark:text-yellow-400 font-semibold">
                            Comprado ({formatBRL(alert.savedAmount)} economizados)
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
                      {alert.productName}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-lg font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                        {formatBRL(alert.newPrice)}
                      </span>
                      <span className="text-xs font-mono-num text-zinc-400 line-through">
                        {formatBRL(alert.oldPrice)}
                      </span>
                      <span className="text-xs font-semibold font-mono-num text-red-600 dark:text-red-400">
                        -{alert.discountPercent.toFixed(1).replace('.', ',')}% ({formatBRL(potentialSaving)} OFF)
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Alvo: até {formatBRL(alert.targetMaxPrice)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(isExpanded ? null : alert.id);
                        if (!alert.read) void onMarkRead(alert.id);
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {isExpanded ? 'Ocultar Mensagem' : 'Ver Mensagem WA'}
                    </button>

                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (!alert.read) void onMarkRead(alert.id);
                      }}
                      className="min-h-[38px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </a>

                    <a
                      href={alert.affiliateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (!alert.read) void onMarkRead(alert.id);
                      }}
                      className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Abrir Oferta</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {!alert.purchased ? (
                      <button
                        type="button"
                        onClick={() => void onMarkPurchased(alert.id)}
                        className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-amber-50 dark:hover:bg-yellow-400/10 hover:text-amber-800 dark:hover:text-yellow-400 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Marcar Comprado</span>
                      </button>
                    ) : (
                      <span className="min-h-[38px] px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Economia registrada
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        Mensagem formatada para WhatsApp ({formatDateTime(alert.createdAt)})
                      </p>
                      <pre className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
                        {alert.whatsappMessage}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        Link de Afiliado Injetado
                      </p>
                      <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-amber-700 dark:text-yellow-400 break-all">
                        {alert.affiliateUrl}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                        Ao clicar em &ldquo;Marcar Comprado&rdquo;, a economia de {formatBRL(potentialSaving)} é somada automaticamente ao relatório mensal.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
