import React, {useEffect, useMemo, useState} from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  PauseCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react';
import type {
  AnnouncedDeal,
  BotConfig,
  GroupForwardEntry,
  WhatsappForwarderDispatchResult,
} from '../types.ts';
import {useAuth} from '../contexts/AuthContext.tsx';
import {formatBRL, formatRelativeTime} from '../utils/format.ts';
import {
  buildDirectWhatsAppLink,
  doesDealMatchSelectedProducts,
  formatPhoneDisplay,
  normalizePhoneE164,
  normalizeWhatsappInviteUrl,
} from '../utils/phone.ts';

interface AdminWhatsAppForwarderViewProps {
  botConfig: BotConfig;
  announcedDeals: AnnouncedDeal[];
  groupForwardLog: GroupForwardEntry[];
  onUpdateBotConfig: (patch: Partial<BotConfig>) => Promise<void>;
}

const DEFAULT_WELCOME_MESSAGE =
  'Entre no Grupo Oficial para receber todas as ofertas do site, ou escolha produtos específicos abaixo para receber apenas eles no privado.';

function buildDealPromoMessage(deal: AnnouncedDeal, titlePrefix: string): string {
  const lines = [
    `*${titlePrefix} · Oferta Relâmpago*`,
    '',
    `*${deal.productName}*`,
    `Loja: ${deal.storeName}`,
    `De ${formatBRL(deal.referencePrice)} por *${formatBRL(deal.announcedPrice)}* (-${Math.round(deal.announcedDiscountPercent)}%)`,
  ];
  if (deal.couponCode && !deal.couponIsPageActivation) {
    lines.push(`Cupom: *${deal.couponCode}*${deal.couponLabel ? ` (${deal.couponLabel})` : ''}`);
  } else if (deal.couponIsPageActivation) {
    lines.push('Cupom: Ative o desconto direto na página da oferta');
  }
  lines.push('', `Link da oferta: ${deal.affiliateUrl}`);
  return lines.join('\n');
}

export const AdminWhatsAppForwarderView: React.FC<AdminWhatsAppForwarderViewProps> = ({
  botConfig,
  announcedDeals,
  groupForwardLog,
  onUpdateBotConfig,
}) => {
  const {
    isAdmin,
    forwarderSettings,
    adminSubscribers,
    saveForwarderSettings,
    adminToggleSubscriberOptIn,
    adminRemoveSubscriber,
  } = useAuth();

  // Official Sender + WhatsApp Group settings
  const [senderPhone, setSenderPhone] = useState<string>(
    forwarderSettings?.senderPhone || botConfig.whatsappPhone || '',
  );
  const [senderDisplayName, setSenderDisplayName] = useState<string>(
    forwarderSettings?.senderDisplayName || 'Mega Achados 027',
  );
  const [groupName, setGroupName] = useState<string>(
    forwarderSettings?.groupName || botConfig.whatsappGroupName || 'Grupo VIP Mega Achados 027',
  );
  const [groupInviteUrl, setGroupInviteUrl] = useState<string>(
    forwarderSettings?.groupInviteUrl || botConfig.whatsappGroupInviteUrl || '',
  );
  const [groupJid, setGroupJid] = useState<string>(botConfig.whatsappGroupJid || '');
  const [autoForwardAllDealsToGroup, setAutoForwardAllDealsToGroup] = useState<boolean>(
    forwarderSettings?.autoForwardAllDealsToGroup ??
      (botConfig.autoForwardAllDealsToGroup !== false),
  );
  const [enabled, setEnabled] = useState<boolean>(forwarderSettings?.enabled ?? true);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(
    forwarderSettings?.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(botConfig.whatsappWebhookUrl || '');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Group Auto-Forward actions
  const [forwardingAllToGroup, setForwardingAllToGroup] = useState(false);
  const [groupActionFeedback, setGroupActionFeedback] = useState<string | null>(null);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);

  // Private Forwarding (Strictly ONLY for customers who chose that product)
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [customPrivateKeyword, setCustomPrivateKeyword] = useState<string>('');
  const [composerMessage, setComposerMessage] = useState<string>('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [dispatchingPrivate, setDispatchingPrivate] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<WhatsappForwarderDispatchResult | null>(
    null,
  );
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [sessionSentUids, setSessionSentUids] = useState<Record<string, boolean>>({});

  // Subscriber directory filter
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [busySubUid, setBusySubUid] = useState<string | null>(null);

  useEffect(() => {
    if (forwarderSettings) {
      setSenderPhone(forwarderSettings.senderPhone);
      setSenderDisplayName(forwarderSettings.senderDisplayName);
      setEnabled(forwarderSettings.enabled);
      setWelcomeMessage(forwarderSettings.welcomeMessage || DEFAULT_WELCOME_MESSAGE);
      if (forwarderSettings.groupName) setGroupName(forwarderSettings.groupName);
      if (forwarderSettings.groupInviteUrl !== undefined) {
        setGroupInviteUrl(forwarderSettings.groupInviteUrl);
      }
      if (typeof forwarderSettings.autoForwardAllDealsToGroup === 'boolean') {
        setAutoForwardAllDealsToGroup(forwarderSettings.autoForwardAllDealsToGroup);
      }
    }
  }, [forwarderSettings]);

  useEffect(() => {
    setWebhookUrl(botConfig.whatsappWebhookUrl || '');
    setGroupJid(botConfig.whatsappGroupJid || '');
  }, [botConfig.whatsappWebhookUrl, botConfig.whatsappGroupJid]);

  const activeSubscribers = useMemo(
    () => adminSubscribers.filter((s) => s.optIn),
    [adminSubscribers],
  );

  const selectedDeal = useMemo(
    () => announcedDeals.find((d) => d.id === selectedDealId) || null,
    [announcedDeals, selectedDealId],
  );

  // Strictly match ONLY subscribers who chose this specific product for private alerts!
  const matchedPrivateSubscribers = useMemo(() => {
    const productTitle = selectedDeal?.productName || customPrivateKeyword.trim();
    const productCategory = selectedDeal?.category || '';
    if (!productTitle) return [];

    return activeSubscribers.filter((sub) => {
      if (!sub.receiveProducts) return false;
      return doesDealMatchSelectedProducts(productTitle, productCategory, sub.selectedProducts);
    });
  }, [activeSubscribers, selectedDeal, customPrivateKeyword]);

  const filteredSubscribers = useMemo(() => {
    const q = subscriberSearch.trim().toLowerCase();
    if (!q) return adminSubscribers;
    return adminSubscribers.filter(
      (sub) =>
        sub.displayName.toLowerCase().includes(q) ||
        sub.phoneNumber.toLowerCase().includes(q) ||
        formatPhoneDisplay(sub.phoneNumber).toLowerCase().includes(q) ||
        sub.selectedProducts.some((p) => p.toLowerCase().includes(q)),
    );
  }, [adminSubscribers, subscriberSearch]);

  const pendingGroupCount = useMemo(
    () => groupForwardLog.filter((e) => e.status === 'ready_for_group').length,
    [groupForwardLog],
  );

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-8 text-center">
        <ShieldCheck className="w-8 h-8 text-red-600 dark:text-yellow-400 mx-auto mb-2" />
        <h2 className="text-base font-bold text-zinc-950 dark:text-white">
          Acesso restrito ao Administrador
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Somente o administrador pode configurar o Grupo do WhatsApp e o encaminhador de mensagens.
        </p>
      </div>
    );
  }

  const handleSaveSenderAndGroupConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsFeedback(null);

    const normalizedPhone = normalizePhoneE164(senderPhone);
    if (!normalizedPhone) {
      setSettingsFeedback({
        type: 'error',
        text: 'Número inválido. Use DDD + número (ex: (27) 99842-7710 ou +5527998427710).',
      });
      return;
    }

    const normalizedInvite = normalizeWhatsappInviteUrl(groupInviteUrl);
    if (normalizedInvite === null) {
      setSettingsFeedback({
        type: 'error',
        text: 'Link do grupo inválido. Use um link oficial do WhatsApp (https://chat.whatsapp.com/...).',
      });
      return;
    }

    setSavingSettings(true);
    try {
      const cleanGroupName = groupName.trim() || 'Grupo VIP Mega Achados 027';
      await saveForwarderSettings({
        senderPhone: normalizedPhone,
        senderDisplayName: senderDisplayName.trim() || 'Mega Achados 027',
        enabled,
        welcomeMessage: welcomeMessage.trim().slice(0, 400),
        groupName: cleanGroupName,
        groupInviteUrl: normalizedInvite,
        autoForwardAllDealsToGroup,
      });

      await onUpdateBotConfig({
        whatsappPhone: normalizedPhone,
        whatsappGroupName: cleanGroupName,
        whatsappGroupInviteUrl: normalizedInvite,
        whatsappGroupJid: groupJid.trim(),
        autoForwardAllDealsToGroup,
        whatsappWebhookUrl: webhookUrl.trim(),
      });

      setSenderPhone(normalizedPhone);
      setGroupInviteUrl(normalizedInvite);
      setSettingsFeedback({
        type: 'success',
        text: 'Grupo Oficial e número encaminhador salvos! Todas as novas promoções do site serão enviadas ao grupo.',
      });
      window.setTimeout(() => setSettingsFeedback(null), 4500);
    } catch (err) {
      setSettingsFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao salvar configuração.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleForwardAllActiveDealsToGroup = async () => {
    setForwardingAllToGroup(true);
    setGroupActionFeedback(null);
    try {
      const resp = await fetch('/api/whatsapp-forwarder/dispatch-group', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({forwardAllActive: true}),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Falha ao encaminhar ofertas ao grupo.');
      }
      if (data.mode === 'webhook') {
        setGroupActionFeedback(
          `${data.sentCount} de ${data.totalCount} oferta(s) ativa(s) encaminhada(s) automaticamente ao grupo via Webhook.`,
        );
      } else {
        setGroupActionFeedback(
          `${data.totalCount} oferta(s) ativa(s) sincronizada(s) na fila do grupo! Clique em "Enviar no Grupo" em cada item ou configure o Webhook para disparo automático.`,
        );
      }
    } catch (err) {
      setGroupActionFeedback(
        err instanceof Error ? err.message : 'Erro ao sincronizar ofertas com o grupo.',
      );
    } finally {
      setForwardingAllToGroup(false);
    }
  };

  const handleMarkGroupEntrySent = async (entryId: string) => {
    try {
      await fetch(`/api/whatsapp-forwarder/group-log/${entryId}/mark-sent`, {
        method: 'POST',
      });
    } catch {
      // Non-fatal
    }
  };

  const handleCopyGroupEntry = async (entry: GroupForwardEntry) => {
    try {
      await navigator.clipboard.writeText(entry.message);
      setCopiedEntryId(entry.id);
      window.setTimeout(() => setCopiedEntryId(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSelectDealForPrivate = (dealId: string) => {
    setSelectedDealId(dealId);
    const deal = announcedDeals.find((d) => d.id === dealId);
    if (!deal) return;
    setCustomPrivateKeyword('');
    setComposerMessage(buildDealPromoMessage(deal, senderDisplayName.trim() || 'Mega Achados 027'));
    setDispatchResult(null);
    setDispatchError(null);
    setSessionSentUids({});
  };

  const handleCopyPrivateMessage = async () => {
    if (!composerMessage.trim()) return;
    try {
      await navigator.clipboard.writeText(composerMessage);
      setCopiedMessage(true);
      window.setTimeout(() => setCopiedMessage(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handlePrivateWebhookDispatch = async () => {
    if (!composerMessage.trim()) {
      setDispatchError('Selecione uma oferta ou escreva a mensagem antes de encaminhar.');
      return;
    }
    if (matchedPrivateSubscribers.length === 0) {
      setDispatchError(
        'Nenhum cliente escolheu este produto para receber no privado. Envie no Grupo Oficial para atingir todos.',
      );
      return;
    }

    setDispatchingPrivate(true);
    setDispatchError(null);
    setDispatchResult(null);
    try {
      const resp = await fetch('/api/whatsapp-forwarder/dispatch', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          senderPhone: forwarderSettings?.senderPhone || normalizePhoneE164(senderPhone) || '',
          senderDisplayName:
            forwarderSettings?.senderDisplayName || senderDisplayName || 'Mega Achados 027',
          message: composerMessage.trim(),
          recipients: matchedPrivateSubscribers.map((sub) => ({
            uid: sub.uid,
            displayName: sub.displayName,
            phoneNumber: sub.phoneNumber,
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Falha ao encaminhar no privado via Webhook.');
      }
      const typed = data as WhatsappForwarderDispatchResult;
      setDispatchResult(typed);
      if (typed.mode === 'webhook') {
        const sentMap: Record<string, boolean> = {};
        typed.results.forEach((r) => {
          if (r.ok) sentMap[r.uid] = true;
        });
        setSessionSentUids((prev) => ({...prev, ...sentMap}));
      }
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Erro ao encaminhar mensagens.');
    } finally {
      setDispatchingPrivate(false);
    }
  };

  const handleToggleOptIn = async (uid: string, nextOptIn: boolean) => {
    setBusySubUid(uid);
    try {
      await adminToggleSubscriberOptIn(uid, nextOptIn);
    } finally {
      setBusySubUid(null);
    }
  };

  const handleRemoveSub = async (uid: string) => {
    setBusySubUid(uid);
    try {
      await adminRemoveSubscriber(uid);
    } finally {
      setBusySubUid(null);
    }
  };

  const hasWebhookConfigured = Boolean(botConfig.whatsappWebhookUrl?.trim());
  const currentGroupName =
    forwarderSettings?.groupName || botConfig.whatsappGroupName || 'Grupo VIP Mega Achados 027';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-yellow-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Exclusivo Administrador</span>
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-normal">
            Grupo WhatsApp & Encaminhador
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Todas as promoções publicadas no site vão automaticamente para o <strong>Grupo Oficial</strong>. No privado, cada cliente recebe <strong>apenas os produtos que escolher</strong>.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Grupo Oficial</p>
          <p className="mt-1 text-sm sm:text-base font-bold text-zinc-950 dark:text-white truncate">
            {currentGroupName}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            {autoForwardAllDealsToGroup ? 'Auto-envio de todas as ofertas ON' : 'Auto-envio pausado'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ofertas na Fila do Grupo</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
            {groupForwardLog.length}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {pendingGroupCount > 0
              ? `${pendingGroupCount} aguardando envio manual`
              : 'Tudo encaminhado ao grupo'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Alertas Privados Ativos</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
            {activeSubscribers.filter((s) => s.selectedProducts.length > 0).length}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            De {adminSubscribers.length} telefone(s) vinculado(s)
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Modo de Disparo</p>
          <p className="mt-1 text-sm sm:text-base font-bold text-zinc-950 dark:text-white">
            {hasWebhookConfigured ? 'Webhook Automático' : 'WhatsApp 1-Clique'}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {hasWebhookConfigured ? 'Posta sozinho no grupo' : 'Clique para postar no grupo'}
          </p>
        </div>
      </div>

      {/* Main 2-Column Workspace: Left = Group & Sender Setup | Right = Auto Group Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Official Group + Sender Phone Setup */}
        <form
          onSubmit={handleSaveSenderAndGroupConfig}
          className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-red-600 dark:text-yellow-400" />
              <span>Configurar Grupo Oficial & Remetente</span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Defina o grupo que recebe todas as ofertas do site e o seu número remetente oficial.
            </p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Nome do Grupo do WhatsApp
              </label>
              <input
                type="text"
                maxLength={100}
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Grupo VIP Mega Achados 027"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Link de Convite do Grupo (aparece para os clientes entrarem)</span>
              </label>
              <input
                type="url"
                maxLength={300}
                value={groupInviteUrl}
                onChange={(e) => setGroupInviteUrl(e.target.value)}
                placeholder="https://chat.whatsapp.com/SeuCodigoDeConvite"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-950 dark:text-white">
                  Encaminhar TODAS as promoções ao Grupo
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Cada oferta publicada no site (ciclo 5 min ou busca manual) entra automaticamente para o grupo
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoForwardAllDealsToGroup}
                onClick={() => setAutoForwardAllDealsToGroup((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                  autoForwardAllDealsToGroup
                    ? 'bg-emerald-600 dark:bg-yellow-400'
                    : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-950 shadow transition-transform mt-0.5 ${
                    autoForwardAllDealsToGroup ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-red-600 dark:text-yellow-400" />
                  <span>Seu número de WhatsApp Encaminhador (Remetente)</span>
                </label>
                <input
                  type="tel"
                  required
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="Ex: (27) 99842-7710 ou +5527998427710"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Nome de exibição do remetente
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={senderDisplayName}
                  onChange={(e) => setSenderDisplayName(e.target.value)}
                  placeholder="Mega Achados 027"
                  className="w-full min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Instrução exibida na conta do cliente
                </label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder={DEFAULT_WELCOME_MESSAGE}
                  className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400 resize-none"
                />
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C10] p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-950 dark:text-white">
                    Encaminhador Ativo
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Permite confirmação de clientes na conta deles
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setEnabled((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                    enabled ? 'bg-emerald-600 dark:bg-yellow-400' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-950 shadow transition-transform mt-0.5 ${
                      enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Optional Server Webhook for Automatic Unattended Posting */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Webhook className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                <span>Automação 100% sem clique (Webhook + ID do Grupo · Opcional)</span>
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://sua-api-whatsapp.com/webhook (Evolution, Z-API, n8n...)"
                className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
              <input
                type="text"
                maxLength={120}
                value={groupJid}
                onChange={(e) => setGroupJid(e.target.value)}
                placeholder="ID/JID do Grupo na API (ex: 120363012345678901@g.us)"
                className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono-num text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          </div>

          {settingsFeedback && (
            <p
              className={`text-xs font-medium rounded-xl px-3 py-2 ${
                settingsFeedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
              }`}
            >
              {settingsFeedback.text}
            </p>
          )}

          <button
            type="submit"
            disabled={savingSettings}
            className="w-full min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>
              {savingSettings ? 'Salvando...' : 'Salvar Configuração do Grupo & Encaminhador'}
            </span>
          </button>
        </form>

        {/* Right: Automatic WhatsApp Group Forwarding Feed (ALL Site Promotions) */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Fila Automática do Grupo ({currentGroupName})</span>
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Toda promoção que entra no site aparece aqui pronta (ou já enviada via Webhook) para o Grupo do WhatsApp.
              </p>
            </div>

            <button
              type="button"
              disabled={forwardingAllToGroup || announcedDeals.length === 0}
              onClick={() => void handleForwardAllActiveDealsToGroup()}
              className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${forwardingAllToGroup ? 'animate-spin' : ''}`} />
              <span>
                {forwardingAllToGroup
                  ? 'Encaminhando...'
                  : `Enviar ${announcedDeals.length} Ativas ao Grupo`}
              </span>
            </button>
          </div>

          {groupActionFeedback && (
            <p className="text-xs font-medium rounded-xl px-3.5 py-2.5 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
              {groupActionFeedback}
            </p>
          )}

          {groupForwardLog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Nenhuma promoção encaminhada ao grupo neste ciclo ainda
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                Clique em &ldquo;Enviar Ativas ao Grupo&rdquo; acima ou aguarde o próximo ciclo de 5 minutos — todas as novas ofertas do site entrarão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {groupForwardLog.map((entry) => {
                const isSent =
                  entry.status === 'webhook_sent' || entry.status === 'sent_manually';
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C10] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white line-clamp-1">
                          {entry.productName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>{entry.storeName}</span>
                          {entry.price > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num font-bold text-amber-700 dark:text-yellow-400">
                                {formatBRL(entry.price)}
                              </span>
                            </>
                          )}
                          {entry.couponCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num font-semibold text-emerald-700 dark:text-emerald-400">
                                Cupom {entry.couponCode}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeTime(entry.createdAt)}</span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          entry.status === 'webhook_sent'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : entry.status === 'sent_manually'
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-yellow-400'
                        }`}
                      >
                        {entry.status === 'webhook_sent'
                          ? 'Enviado (Auto)'
                          : entry.status === 'sent_manually'
                            ? 'Enviado ao Grupo'
                            : 'Pronto p/ Grupo'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={buildDirectWhatsAppLink('', entry.message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleMarkGroupEntrySent(entry.id)}
                        className={`min-h-[34px] px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          isSent
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isSent ? (
                          <CheckCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{isSent ? 'Reenviar no Grupo' : 'Enviar no Grupo (WhatsApp)'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        type="button"
                        onClick={() => void handleCopyGroupEntry(entry)}
                        className="min-h-[34px] px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
                      >
                        {copiedEntryId === entry.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedEntryId === entry.id ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      {entry.lastAttemptDetail && (
                        <span className="text-[11px] text-zinc-400 truncate max-w-full">
                          {entry.lastAttemptDetail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Private Forwarding — STRICTLY ONLY for Customers Who Chose That Product */}
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Encaminhar no Privado (Apenas Quem Escolheu o Produto)</span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Para evitar spam no privado, o sistema filtra automaticamente e só libera o envio para os clientes que selecionaram este produto na conta deles.
            </p>
          </div>
          <span className="text-xs font-semibold font-mono-num text-emerald-700 dark:text-emerald-400">
            {matchedPrivateSubscribers.length} cliente(s) escolheram este produto
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-7">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Selecionar oferta anunciada
            </label>
            <select
              value={selectedDealId}
              onChange={(e) => handleSelectDealForPrivate(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            >
              <option value="">Escolha uma oferta ativa ({announcedDeals.length})...</option>
              {announcedDeals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.storeName} · {deal.productName.slice(0, 52)} ({formatBRL(deal.announcedPrice)})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Ou digite o nome do produto manualmente
            </label>
            <input
              type="text"
              value={customPrivateKeyword}
              onChange={(e) => {
                setCustomPrivateKeyword(e.target.value);
                if (e.target.value.trim()) setSelectedDealId('');
              }}
              placeholder="Ex: iPhone 15, Air Fryer, PS5..."
              className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
          </div>
        </div>

        <div>
          <textarea
            rows={4}
            maxLength={2000}
            value={composerMessage}
            onChange={(e) => setComposerMessage(e.target.value)}
            placeholder="Mensagem personalizada para enviar no privado aos clientes que escolheram este produto..."
            className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs sm:text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasWebhookConfigured && (
            <button
              type="button"
              disabled={
                dispatchingPrivate ||
                matchedPrivateSubscribers.length === 0 ||
                !composerMessage.trim()
              }
              onClick={() => void handlePrivateWebhookDispatch()}
              className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {dispatchingPrivate
                  ? 'Encaminhando...'
                  : `Disparar no Privado (${matchedPrivateSubscribers.length})`}
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={!composerMessage.trim()}
            onClick={() => void handleCopyPrivateMessage()}
            className="min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#0B0C10] text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {copiedMessage ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedMessage ? 'Copiado' : 'Copiar texto'}</span>
          </button>
        </div>

        {dispatchError && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {dispatchError}
          </p>
        )}

        {dispatchResult && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            Disparo privado concluído:{' '}
            <strong className="font-mono-num">{dispatchResult.sentCount}</strong> de{' '}
            <strong className="font-mono-num">{dispatchResult.totalCount}</strong> enviado(s).
          </div>
        )}

        {/* Matching Private Recipients */}
        {(selectedDeal || customPrivateKeyword.trim()) && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            {matchedPrivateSubscribers.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nenhum cliente escolheu receber <strong>{selectedDeal?.productName || customPrivateKeyword}</strong> no privado. Essa oferta já vai para todos no Grupo Oficial!
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>
                    Clientes que escolheram este produto ({matchedPrivateSubscribers.length})
                  </span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {matchedPrivateSubscribers.map((sub) => {
                    const alreadySent = Boolean(sessionSentUids[sub.uid]);
                    const msgToSend =
                      composerMessage.trim() ||
                      `Olá ${sub.displayName}! Achamos promoção do produto que você escolheu: ${
                        selectedDeal?.productName || customPrivateKeyword
                      }`;
                    return (
                      <div
                        key={sub.uid}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C10] px-3 py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                            {sub.displayName}
                          </p>
                          <p className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400 truncate">
                            {formatPhoneDisplay(sub.phoneNumber)}
                          </p>
                        </div>
                        <a
                          href={buildDirectWhatsAppLink(sub.phoneNumber, msgToSend)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            setSessionSentUids((prev) => ({...prev, [sub.uid]: true}))
                          }
                          className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors ${
                            alreadySent
                              ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {alreadySent ? (
                            <>
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>Enviado</span>
                            </>
                          ) : (
                            <>
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Privado</span>
                            </>
                          )}
                        </a>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Directory of Linked Customers & Their Chosen Private Products */}
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-red-600 dark:text-yellow-400" />
              <span>Clientes Vinculados & Produtos Escolhidos ({adminSubscribers.length})</span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Veja exatamente quais produtos cada cliente escolheu receber no privado.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={subscriberSearch}
              onChange={(e) => setSubscriberSearch(e.target.value)}
              placeholder="Buscar cliente, telefone ou produto..."
              className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
          </div>
        </div>

        {filteredSubscribers.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {adminSubscribers.length === 0
                ? 'Nenhum cliente vinculou o WhatsApp ainda'
                : 'Nenhum cliente encontrado para esta busca'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Quando os clientes entrarem em &ldquo;Minha Conta&rdquo;, poderão entrar no Grupo Oficial e escolher os produtos que desejam receber no privado.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredSubscribers.map((sub) => {
              const isBusy = busySubUid === sub.uid;
              return (
                <div
                  key={sub.uid}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                        {sub.displayName}
                      </p>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          sub.optIn
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {sub.optIn ? 'Privado Ativo' : 'Pausado'}
                      </span>
                      <span className="font-mono-num text-xs text-zinc-600 dark:text-zinc-300">
                        {formatPhoneDisplay(sub.phoneNumber)}
                      </span>
                    </div>

                    {/* Chosen private products list */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sub.selectedProducts.length > 0 ? (
                        sub.selectedProducts.map((prod) => (
                          <span
                            key={prod}
                            className="px-2 py-0.5 rounded-md bg-amber-500/10 dark:bg-yellow-400/10 border border-amber-500/20 dark:border-yellow-400/20 text-[11px] font-medium text-amber-800 dark:text-yellow-300"
                          >
                            {prod}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          Nenhum produto escolhido para o privado ainda
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleOptIn(sub.uid, !sub.optIn)}
                      className="min-h-[36px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {sub.optIn ? (
                        <>
                          <PauseCircle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                          <span>Pausar</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Ativar</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleRemoveSub(sub.uid)}
                      aria-label={`Remover ${sub.displayName}`}
                      className="min-h-[36px] min-w-[36px] rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:border-red-500/40 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
