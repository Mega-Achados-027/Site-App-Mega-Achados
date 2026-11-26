import React, {useEffect, useMemo, useState} from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Ticket,
} from 'lucide-react';
import type {CouponSyncMeta, StoreConfig, StoreCoupon} from '../types.ts';
import {formatRelativeTime} from '../utils/format.ts';

interface CouponsViewProps {
  coupons: StoreCoupon[];
  stores: StoreConfig[];
  couponMeta?: CouponSyncMeta;
  onRefreshCoupons: () => Promise<void>;
}

function formatCountdown(targetIso?: string, nowMs = Date.now()): string {
  if (!targetIso) return '30m 00s';
  const diffSec = Math.max(0, Math.floor((new Date(targetIso).getTime() - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export const CouponsView: React.FC<CouponsViewProps> = ({
  coupons,
  stores,
  couponMeta,
  onRefreshCoupons,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeStores = useMemo(() => stores.filter((s) => s.active), [stores]);
  const activeStoreIds = useMemo(() => new Set(activeStores.map((s) => s.id)), [activeStores]);

  const activeCoupons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return coupons.filter((c) => {
      if (!c.active || !activeStoreIds.has(c.storeId)) return false;
      if (selectedStoreId !== 'all' && c.storeId !== selectedStoreId) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.storeName.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [coupons, activeStoreIds, selectedStoreId, searchQuery]);

  const couponCountByStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of coupons) {
      if (c.active && activeStoreIds.has(c.storeId)) {
        map.set(c.storeId, (map.get(c.storeId) || 0) + 1);
      }
    }
    return map;
  }, [coupons, activeStoreIds]);

  const handleCopyCode = async (coupon: StoreCoupon) => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopiedId(coupon.id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === coupon.id ? null : prev));
      }, 2500);
    } catch {
      // Clipboard fallback ignored safely inside sandboxed contexts
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshCoupons();
    } finally {
      setRefreshing(false);
    }
  };

  const isBusy = refreshing || Boolean(couponMeta?.isRefreshing);

  return (
    <div className="space-y-6">
      {/* Header & 30-Min Authenticity Renewal Status */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-normal">
            Cupons de <span className="text-red-600 dark:text-yellow-400">Desconto</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Cupons exclusivos das {activeStores.length} lojas configuradas, renovados e validados automaticamente a cada 30 minutos para garantir autenticidade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          <div className="min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
            <span>Próxima renovação:</span>
            <span className="font-mono-num font-bold text-amber-700 dark:text-yellow-400">
              {formatCountdown(couponMeta?.nextRefreshAt, nowMs)}
            </span>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleManualRefresh()}
            className="min-h-[40px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-60 transition-opacity whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            <span>{isBusy ? 'Verificando cupons...' : 'Renovar Agora'}</span>
          </button>
        </div>
      </div>

      {/* Authenticity Strip */}
      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-300">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-950 dark:text-white">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
            <span>Autenticidade verificada a cada 30 min</span>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
            ·
          </span>
          <span>
            Última validação:{' '}
            <strong className="text-zinc-900 dark:text-white">
              {couponMeta?.lastRefreshedAt ? formatRelativeTime(couponMeta.lastRefreshedAt) : 'agora'}
            </strong>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
            ·
          </span>
          <span>
            {activeCoupons.length} {activeCoupons.length === 1 ? 'cupom ativo' : 'cupons ativos'}
          </span>
        </div>

        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Exibindo apenas lojas ativas e configuradas
        </span>
      </div>

      {/* Search & Configured Store Filter */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar código de cupom, loja ou categoria..."
              className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
          </div>

          <select
            aria-label="Filtrar loja configurada"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-200"
          >
            <option value="all">Todas as lojas configuradas ({activeStores.length})</option>
            {activeStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({couponCountByStore.get(store.id) || 0})
              </option>
            ))}
          </select>
        </div>

        {/* Store Quick Switcher */}
        {activeStores.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStoreId('all')}
              className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold border transition-colors ${
                selectedStoreId === 'all'
                  ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
              }`}
            >
              Todas ({coupons.filter((c) => c.active && activeStoreIds.has(c.storeId)).length})
            </button>
            {activeStores.map((store) => {
              const active = selectedStoreId === store.id;
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => setSelectedStoreId(store.id)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent font-semibold'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{backgroundColor: store.accentHex || '#EAB308'}}
                  />
                  <span>{store.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Coupons Grid */}
      {activeStores.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-2">
          <Store className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            Nenhuma loja configurada está ativa no momento
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ative ou cadastre lojas parceiras no painel para liberar cupons verificados.
          </p>
        </div>
      ) : activeCoupons.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-2">
          <Ticket className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            Nenhum cupom encontrado para este filtro
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Limpe a busca ou clique em &ldquo;Renovar Agora&rdquo; para revalidar os cupons das lojas configuradas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {activeCoupons.map((coupon) => {
            const isCopied = copiedId === coupon.id;
            return (
              <article
                key={coupon.id}
                className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col justify-between gap-4 hover:border-yellow-400/60 transition-colors"
              >
                <div className="space-y-3.5">
                  {/* Top Store + Discount Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{backgroundColor: coupon.storeAccentHex || '#EAB308'}}
                      >
                        {coupon.storeName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-950 dark:text-white truncate">
                          {coupon.storeName}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                          {coupon.category} · {coupon.minPurchaseLabel}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-mono-num text-xs font-bold shrink-0">
                      {coupon.discountLabel}
                    </span>
                  </div>

                  {/* Title & Rules */}
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-zinc-950 dark:text-white leading-snug">
                      {coupon.title}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {coupon.description}
                    </p>
                  </div>

                  {/* Authenticity Meta */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-yellow-400">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {coupon.verificationSource === 'google_search'
                          ? 'Validado ao vivo'
                          : 'Autenticado'}
                      </span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Verificado {formatRelativeTime(coupon.verifiedAt)}</span>
                  </div>
                </div>

                {/* Coupon Code Box & Actions */}
                <div className="space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-amber-500/60 dark:border-yellow-400/50 bg-amber-50/50 dark:bg-yellow-400/[0.06]">
                    <span className="font-mono-num text-sm font-extrabold tracking-wider text-zinc-950 dark:text-yellow-300 select-all">
                      {coupon.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(coupon)}
                      className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
                        isCopied
                          ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                          : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 hover:border-yellow-400'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  <a
                    href={coupon.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Usar Cupom na {coupon.storeName}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
