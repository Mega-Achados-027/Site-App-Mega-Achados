import React, {useState} from 'react';
import {
  Check,
  Copy,
  Globe,
  Link2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type {AffiliateMode, StoreConfig} from '../types.ts';
import {buildAffiliateUrl} from '../utils/affiliate.ts';
import {AffiliateTutorialPanel} from './AffiliateTutorialPanel.tsx';

interface StoresAffiliatesViewProps {
  stores: StoreConfig[];
  onUpdateStore: (storeId: string, patch: Partial<StoreConfig>) => Promise<void>;
  onCreateStore: (payload: Omit<StoreConfig, 'id' | 'isCustom'>) => Promise<void>;
  onDeleteStore: (storeId: string) => Promise<void>;
}

export const StoresAffiliatesView: React.FC<StoresAffiliatesViewProps> = ({
  stores,
  onUpdateStore,
  onCreateStore,
  onDeleteStore,
}) => {
  const [drafts, setDrafts] = useState<Record<string, Partial<StoreConfig>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testUrlInput, setTestUrlInput] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newMode, setNewMode] = useState<AffiliateMode>('query');
  const [newParam, setNewParam] = useState('ref');
  const [newTag, setNewTag] = useState('');
  const [newTemplate, setNewTemplate] = useState('{raw_url}?ref={id}');
  const [newShipping, setNewShipping] = useState('Frete padrão R$ 19,90');
  const [newInstallments, setNewInstallments] = useState('10x sem juros');
  const [creating, setCreating] = useState(false);

  const getStoreValue = (store: StoreConfig): StoreConfig => ({
    ...store,
    ...(drafts[store.id] || {}),
  });

  const updateDraft = (storeId: string, patch: Partial<StoreConfig>) => {
    setDrafts((prev) => ({
      ...prev,
      [storeId]: {...(prev[storeId] || {}), ...patch},
    }));
  };

  const handleSaveStore = async (store: StoreConfig) => {
    const merged = getStoreValue(store);
    setSavingId(store.id);
    try {
      await onUpdateStore(store.id, {
        affiliateMode: merged.affiliateMode,
        affiliateParam: merged.affiliateParam,
        affiliateTag: merged.affiliateTag,
        affiliateTemplate: merged.affiliateTemplate,
        defaultShipping: merged.defaultShipping,
        installmentsInfo: merged.installmentsInfo,
      });
      setDrafts((prev) => {
        const next = {...prev};
        delete next[store.id];
        return next;
      });
      setSavedId(store.id);
      window.setTimeout(() => setSavedId((curr) => (curr === store.id ? null : curr)), 2200);
    } finally {
      setSavingId(null);
    }
  };

  const handleApplyFromTutorial = async (storeId: string, patch: Partial<StoreConfig>) => {
    await onUpdateStore(storeId, patch);
    setDrafts((prev) => {
      const next = {...prev};
      delete next[storeId];
      return next;
    });
    setSavedId(storeId);
    window.setTimeout(() => setSavedId((curr) => (curr === storeId ? null : curr)), 2600);
  };

  const handleCopyPreview = async (storeId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(storeId);
      window.setTimeout(() => setCopiedId((curr) => (curr === storeId ? null : curr)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleAddStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDomain.trim()) return;
    setCreating(true);
    try {
      await onCreateStore({
        name: newName.trim(),
        domain: newDomain.trim(),
        active: true,
        accentHex: '#FACC15',
        affiliateMode: newMode,
        affiliateParam: newParam.trim() || 'ref',
        affiliateTag: newTag.trim(),
        affiliateTemplate: newTemplate.trim() || '{raw_url}?ref={id}',
        defaultShipping: newShipping.trim() || 'Frete padrão',
        installmentsInfo: newInstallments.trim() || '10x sem juros',
      });
      setNewName('');
      setNewDomain('');
      setNewTag('');
      setNewParam('ref');
      setNewTemplate('{raw_url}?ref={id}');
      setShowAddModal(false);
    } finally {
      setCreating(false);
    }
  };

  const activeCount = stores.filter((s) => s.active).length;
  const configuredAffCount = stores.filter((s) => s.affiliateTag.trim().length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Múltiplas Lojas & Links de Afiliados
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Configure quais lojas o Mega Achados 027 monitora simultaneamente e defina seu ID de afiliado por site para converter 100% dos links automaticamente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar Nova Loja</span>
        </button>
      </div>

      {/* Mini Tutorial + Automatic Affiliate Tag Extractor */}
      <AffiliateTutorialPanel stores={stores} onApplyDetected={handleApplyFromTutorial} />

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Lojas Monitoradas Simultaneamente</p>
          <p className="mt-1 text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
            {activeCount} <span className="text-sm font-normal text-zinc-400">de {stores.length}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Sites com Seu Afiliado Ativo</p>
          <p className="mt-1 text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
            {configuredAffCount} <span className="text-sm font-normal text-zinc-400">configurados</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Conversão Automática nos Disparos</p>
          <p className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
            WhatsApp · Push · Redes Sociais
          </p>
        </div>
      </div>

      {/* Store Cards List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {stores.map((store) => {
          const val = getStoreValue(store);
          const hasUnsaved = Boolean(drafts[store.id]);
          const sampleRawUrl =
            testUrlInput[store.id] || `https://www.${val.domain}/produto/oferta-destaque-2026`;
          const generatedAffiliateUrl = buildAffiliateUrl(sampleRawUrl, val);

          return (
            <div
              key={store.id}
              className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-zinc-950 dark:text-white truncate">
                        {val.name}
                      </h2>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        · {val.domain}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {val.active ? 'Monitoramento ativo em tempo real' : 'Monitoramento pausado'}
                      {val.isCustom ? ' · Loja personalizada' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onUpdateStore(store.id, {active: !store.active})}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                        store.active
                          ? 'border-amber-300 dark:border-yellow-500/40 bg-amber-50 dark:bg-yellow-400/10 text-amber-800 dark:text-yellow-400'
                          : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {store.active ? 'Ativa' : 'Pausada'}
                    </button>
                    {store.isCustom && (
                      <button
                        type="button"
                        onClick={() => void onDeleteStore(store.id)}
                        aria-label={`Remover ${store.name}`}
                        className="min-h-[36px] min-w-[36px] rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-red-500 hover:border-red-300 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Affiliate Config Fields */}
                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Modo do Link de Afiliado
                    </label>
                    <select
                      value={val.affiliateMode}
                      onChange={(e) =>
                        updateDraft(store.id, {affiliateMode: e.target.value as AffiliateMode})
                      }
                      className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                    >
                      <option value="query">Parâmetro na URL (?tag=...)</option>
                      <option value="path_prefix">Loja Parceira / Prefixo</option>
                      <option value="template">Template Personalizado (Awin / Lomadee)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Seu ID / Tag de Afiliado
                    </label>
                    <input
                      type="text"
                      value={val.affiliateTag}
                      onChange={(e) => updateDraft(store.id, {affiliateTag: e.target.value})}
                      placeholder="Ex: megaachados027-20"
                      className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                    />
                  </div>

                  {val.affiliateMode === 'query' && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                        Nome do Parâmetro (query)
                      </label>
                      <input
                        type="text"
                        value={val.affiliateParam}
                        onChange={(e) => updateDraft(store.id, {affiliateParam: e.target.value})}
                        placeholder="tag, ref, awinaffid, matt_word..."
                        className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                      />
                    </div>
                  )}

                  {(val.affiliateMode === 'template' || val.affiliateMode === 'path_prefix') && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                        Template de URL (use {'{id}'}, {'{url}'}, {'{raw_url}'}, {'{path}'})
                      </label>
                      <input
                        type="text"
                        value={val.affiliateTemplate}
                        onChange={(e) => updateDraft(store.id, {affiliateTemplate: e.target.value})}
                        className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                      />
                    </div>
                  )}

                  {val.affiliateMode === 'query' && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                        Frete padrão estimado
                      </label>
                      <input
                        type="text"
                        value={val.defaultShipping}
                        onChange={(e) => updateDraft(store.id, {defaultShipping: e.target.value})}
                        className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                      />
                    </div>
                  )}
                </div>

                {/* Live Affiliate Link Preview & Tester */}
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                      <Link2 className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                      Prévia do link gerado automaticamente
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyPreview(store.id, generatedAffiliateUrl)}
                      className="text-red-600 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      {copiedId === store.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar link</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={testUrlInput[store.id] ?? ''}
                    onChange={(e) =>
                      setTestUrlInput((prev) => ({...prev, [store.id]: e.target.value}))
                    }
                    placeholder={`Cole qualquer URL de ${val.domain} para testar a conversão...`}
                    className="w-full min-h-[34px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0B0C10] text-[11px] text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                  <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200/80 dark:border-zinc-800 text-[11px] font-mono text-amber-700 dark:text-yellow-400 break-all">
                    {generatedAffiliateUrl}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {savedId === store.id && (
                  <span className="text-xs font-medium text-amber-700 dark:text-yellow-400 inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Afiliado salvo e aplicado em todos os alertas
                  </span>
                )}
                <button
                  type="button"
                  disabled={!hasUnsaved || savingId === store.id}
                  onClick={() => void handleSaveStore(store)}
                  className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    hasUnsaved
                      ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 hover:opacity-90'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingId === store.id ? 'Salvando...' : 'Salvar Configuração'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Custom Store Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-red-600 dark:text-yellow-400" />
                  Adicionar Nova Loja ao Monitoramento
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Expanda o Mega Achados 027 para monitorar novos varejistas simultaneamente com seu link de afiliado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Fechar"
                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStoreSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Nome da Loja *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: TerabyteShop, Pichau, AliExpress"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Domínio da Loja *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="Ex: terabyteshop.com.br"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Modo de Afiliado
                  </label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as AffiliateMode)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  >
                    <option value="query">Parâmetro na URL (?param=id)</option>
                    <option value="path_prefix">Prefixo de Caminho</option>
                    <option value="template">Template Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Seu ID / Tag de Afiliado
                  </label>
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Ex: megaachados027"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
              </div>

              {newMode === 'query' ? (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Nome do Parâmetro
                  </label>
                  <input
                    type="text"
                    value={newParam}
                    onChange={(e) => setNewParam(e.target.value)}
                    placeholder="ref, tag, aff_id, p..."
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Template de Redirecionamento
                  </label>
                  <input
                    type="text"
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder="https://redeafiliada.com/?id={id}&url={url}"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Frete padrão
                  </label>
                  <input
                    type="text"
                    value={newShipping}
                    onChange={(e) => setNewShipping(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Parcelamento padrão
                  </label>
                  <input
                    type="text"
                    value={newInstallments}
                    onChange={(e) => setNewInstallments(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[42px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                >
                  {creating ? 'Adicionando...' : 'Adicionar e Monitorar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
