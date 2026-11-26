import React, {useEffect, useMemo, useState} from 'react';
import {
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Ticket,
  Truck,
  X,
} from 'lucide-react';
import type {
  AnnouncedDeal,
  DealFeedMeta,
  LiveProductStoreSearchResult,
  MonitoredProduct,
} from '../types.ts';
import {useAuth} from '../contexts/AuthContext.tsx';
import {formatBRL, formatRelativeTime} from '../utils/format.ts';
import {ProductImage} from './ProductImage.tsx';

interface MemberDealsViewProps {
  announcedDeals: AnnouncedDeal[];
  dealFeedMeta?: DealFeedMeta;
  products: MonitoredProduct[];
  whatsappGroupName?: string;
  whatsappGroupInviteUrl?: string;
  onManualSearch: (opts?: {query?: string; category?: string}) => Promise<{
    announcedNow: number;
    checkedCount: number;
  }>;
  onLiveProductSearch: (query: string) => Promise<LiveProductStoreSearchResult>;
  onRequireAuth: (mode?: 'login' | 'signup') => void;
}

function formatNextDropCountdown(targetIso?: string, nowMs = Date.now()): string {
  if (!targetIso) return '05m 00s';
  const diffSec = Math.max(0, Math.floor((new Date(targetIso).getTime() - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function formatRemainingTtl(expiresAtIso: string, nowMs: number): string {
  const diffMs = Math.max(0, new Date(expiresAtIso).getTime() - nowMs);
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes <= 0) return 'Expirando...';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const MemberDealsView: React.FC<MemberDealsViewProps> = ({
  announcedDeals,
  dealFeedMeta,
  products,
  whatsappGroupName,
  whatsappGroupInviteUrl,
  onManualSearch,
  onLiveProductSearch,
  onRequireAuth,
}) => {
  const {
    user,
    isDealSaved,
    toggleSaveDeal,
    savedDeals,
    forwarderSettings,
    whatsappSubscription,
    togglePrivateProductAlert,
  } = useAuth();
  const [togglingAlertDealId, setTogglingAlertDealId] = useState<string | null>(null);
  const officialGroupUrl =
    forwarderSettings?.groupInviteUrl?.trim() || whatsappGroupInviteUrl?.trim() || '';
  const officialGroupName =
    forwarderSettings?.groupName?.trim() ||
    whatsappGroupName?.trim() ||
    'Grupo WhatsApp de Ofertas';
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [onlyWithCoupon, setOnlyWithCoupon] = useState(true);
  const [onlySaved, setOnlySaved] = useState(false);
  const [searching, setSearching] = useState(false);
  const [liveSearchLoading, setLiveSearchLoading] = useState(false);
  const [liveSearchResult, setLiveSearchResult] = useState<LiveProductStoreSearchResult | null>(
    null,
  );
  const [liveSearchError, setLiveSearchError] = useState<string | null>(null);
  const [copiedDealId, setCopiedDealId] = useState<string | null>(null);
  const [copiedStoreCouponKey, setCopiedStoreCouponKey] = useState<string | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    announcedDeals.forEach((d) => set.add(d.category));
    return Array.from(set);
  }, [products, announcedDeals]);

  const activeCouponDealsCount = useMemo(
    () =>
      announcedDeals.filter(
        (d) =>
          d.verifiedByManualSearch &&
          new Date(d.expiresAt).getTime() > nowMs &&
          Boolean(d.couponCode),
      ).length,
    [announcedDeals, nowMs],
  );

  const visibleDeals = useMemo(() => {
    const qTokens = normalizeSearchText(searchQuery).split(/\s+/).filter(Boolean);
    return announcedDeals
      .filter((deal) => {
        // Enforce strict 3-hour TTL & verification on client view as well
        if (!deal.verifiedByManualSearch) return false;
        if (new Date(deal.expiresAt).getTime() <= nowMs) return false;
        if (onlyWithCoupon && !deal.couponCode) return false;
        if (onlySaved && !isDealSaved(deal.productId)) return false;
        if (categoryFilter !== 'all' && deal.category !== categoryFilter) return false;
        if (qTokens.length === 0) return true;
        const haystack = normalizeSearchText(
          `${deal.productName} ${deal.brand} ${deal.category} ${deal.storeName} ${deal.couponCode || ''}`,
        );
        return qTokens.every((token) => haystack.includes(token));
      })
      .sort((a, b) => {
        const aTime = new Date(a.announcedAt).getTime();
        const bTime = new Date(b.announcedAt).getTime();
        if (Math.abs(bTime - aTime) >= 15000) return bTime - aTime;
        const aHas = a.couponCode ? 1 : 0;
        const bHas = b.couponCode ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return b.announcedDiscountPercent - a.announcedDiscountPercent;
      });
  }, [announcedDeals, nowMs, onlyWithCoupon, onlySaved, isDealSaved, categoryFilter, searchQuery]);

  const savedProductCount = useMemo(
    () => savedDeals.filter((d) => d.dealType === 'product').length,
    [savedDeals],
  );

  const handleCopyCoupon = async (deal: AnnouncedDeal) => {
    if (!deal.couponCode || deal.couponIsPageActivation) return;
    try {
      await navigator.clipboard.writeText(deal.couponCode);
      setCopiedDealId(deal.id);
      window.setTimeout(() => {
        setCopiedDealId((prev) => (prev === deal.id ? null : prev));
      }, 2500);
    } catch {
      // Clipboard fallback ignored safely in sandboxed frames
    }
  };

  const handleCopyStoreCoupon = async (storeId: string, code: string, isPageActivation?: boolean) => {
    if (!code || isPageActivation) return;
    const key = `${storeId}:${code}`;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedStoreCouponKey(key);
      window.setTimeout(() => {
        setCopiedStoreCouponKey((prev) => (prev === key ? null : prev));
      }, 2500);
    } catch {
      // Clipboard fallback ignored safely in sandboxed frames
    }
  };

  const runLiveStoreSearch = async (queryText: string) => {
    const clean = queryText.trim();
    if (clean.length < 2) return;
    setLiveSearchLoading(true);
    setLiveSearchError(null);
    setSearchFeedback(null);
    try {
      const res = await onLiveProductSearch(clean);
      setLiveSearchResult(res);
    } catch (err) {
      setLiveSearchError(
        err instanceof Error
          ? err.message
          : 'Não foi possível buscar os preços desse produto nas lojas agora.',
      );
    } finally {
      setLiveSearchLoading(false);
    }
  };

  const runManualDealSearch = async (opts?: {query?: string; category?: string}) => {
    setSearching(true);
    setSearchFeedback(null);
    const effectiveQuery = opts?.query !== undefined ? opts.query : searchQuery;
    const effectiveCategory = opts?.category !== undefined ? opts.category : categoryFilter;
    try {
      const res = await onManualSearch({
        query: effectiveQuery,
        category: effectiveCategory,
      });
      if (res.announcedNow > 0) {
        setSearchFeedback(
          `Novo ciclo concluído: ${res.announcedNow} ${
            res.announcedNow === 1
              ? 'nova oferta inédita com cupom encontrada'
              : 'novas ofertas inéditas com cupons encontradas'
          } (expiram automaticamente em 3 horas).`,
        );
      } else {
        setSearchFeedback(
          `Pesquisa concluída (${res.checkedCount} itens verificados): nenhuma oferta inédita nova encontrada para este filtro agora.`,
        );
      }
    } catch {
      setSearchFeedback('Não foi possível concluir a pesquisa manual agora. Tente novamente.');
    } finally {
      setSearching(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      void runLiveStoreSearch(trimmed);
    } else {
      setLiveSearchResult(null);
      setLiveSearchError(null);
      void runManualDealSearch({query: '', category: categoryFilter});
    }
  };

  const handleClearLiveSearch = () => {
    setSearchQuery('');
    setLiveSearchResult(null);
    setLiveSearchError(null);
  };

  const handleDiscoverFreshDeals = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setOnlySaved(false);
    setLiveSearchResult(null);
    setLiveSearchError(null);
    void runManualDealSearch({query: '', category: 'all'});
  };

  return (
    <div className="space-y-6">
      {/* Clean Promo Showcase Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-normal">
            Promoções com <span className="text-red-600 dark:text-yellow-400">Cupom Específico</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Novas ofertas inéditas entram automaticamente a cada 5 minutos sem repetir produtos e expiram após 3 horas. Pesquise qualquer produto para comparar preços e cupons em todas as lojas do app.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          <div className="min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
            <span>{dealFeedMeta?.isPublishing ? 'Publicando novas ofertas...' : 'Próximas ofertas em:'}</span>
            {!dealFeedMeta?.isPublishing && (
              <span className="font-mono-num font-bold text-amber-700 dark:text-yellow-400">
                {formatNextDropCountdown(dealFeedMeta?.nextPublishAt, nowMs)}
              </span>
            )}
          </div>

          {officialGroupUrl && (
            <a
              href={officialGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Entrar em ${officialGroupName} para receber todas as promoções`}
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Entrar no Grupo WhatsApp</span>
            </a>
          )}

          {!user && (
            <button
              type="button"
              onClick={() => onRequireAuth('signup')}
              className="min-h-[40px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Criar conta grátis</span>
            </button>
          )}
        </div>
      </div>

      {/* Product Search (Live Cross-Store Price & Coupon Lookup) & Category Filter Bar */}
      <form
        onSubmit={handleFormSubmit}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar qualquer produto nas lojas do app (ex: iPhone 15, Air Fryer, TV 55, Ryzen, JBL)..."
            className="w-full min-h-[42px] pl-10 pr-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearLiveSearch}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por categoria"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-200"
          >
            <option value="all">Todas as categorias ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyWithCoupon((v) => !v)}
            className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              onlyWithCoupon
                ? 'bg-amber-500/15 dark:bg-yellow-400/15 border-amber-500/60 dark:border-yellow-400/60 text-amber-800 dark:text-yellow-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-zinc-700 dark:text-zinc-200 hover:border-yellow-400/60'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Com cupom ({activeCouponDealsCount})</span>
          </button>

          <button
            type="submit"
            disabled={searching || liveSearchLoading}
            className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${searching || liveSearchLoading ? 'animate-spin' : ''}`}
            />
            <span>
              {liveSearchLoading
                ? 'Buscando nas lojas...'
                : searching
                  ? 'Buscando ofertas...'
                  : searchQuery.trim().length >= 2
                    ? 'Buscar Preços e Cupons'
                    : 'Buscar Novas Ofertas'}
            </span>
          </button>

          {(searchQuery.trim() || liveSearchResult) && (
            <button
              type="button"
              disabled={searching || liveSearchLoading}
              onClick={handleDiscoverFreshDeals}
              className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-yellow-400/60 transition-colors whitespace-nowrap"
            >
              Explorar Novidades
            </button>
          )}

          {user && (
            <button
              type="button"
              onClick={() => setOnlySaved((v) => !v)}
              className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                onlySaved
                  ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-zinc-700 dark:text-zinc-200 hover:border-yellow-400/60'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Salvos ({savedProductCount})</span>
            </button>
          )}
        </div>
      </form>

      {searchFeedback && (
        <div className="rounded-xl bg-amber-50 dark:bg-yellow-400/10 border border-amber-300 dark:border-yellow-400/40 px-4 py-3 text-xs font-medium text-amber-900 dark:text-yellow-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{searchFeedback}</span>
        </div>
      )}

      {/* LIVE CROSS-STORE PRICE & COUPON COMPARISON PANEL (works for ANY searched product) */}
      {(liveSearchLoading || liveSearchError || liveSearchResult) && (
        <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-amber-400/60 dark:border-yellow-400/40 p-5 sm:p-6 space-y-5">
          {liveSearchLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-red-600 dark:text-yellow-400 animate-spin shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                    Pesquisando “{searchQuery.trim()}” nos sites do app...
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Comparando preços ao vivo e verificando cupons ativos em cada loja configurada.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-900 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : liveSearchError ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {liveSearchError}
              </p>
              <button
                type="button"
                onClick={() => void runLiveStoreSearch(searchQuery)}
                className="min-h-[38px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold self-start"
              >
                Tentar novamente
              </button>
            </div>
          ) : liveSearchResult ? (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {liveSearchResult.productImageUrl && (
                    <div className="w-14 h-14 rounded-xl bg-white border border-zinc-200 dark:border-zinc-800 p-1.5 shrink-0 overflow-hidden">
                      <ProductImage
                        src={liveSearchResult.productImageUrl}
                        alt={liveSearchResult.query}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-yellow-400 font-semibold">
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span>Preços e cupons nas lojas configuradas do app</span>
                    </div>
                    <h2 className="text-lg font-extrabold text-zinc-950 dark:text-white truncate">
                      “{liveSearchResult.query}”
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {liveSearchResult.storesWithPriceCount} de{' '}
                      {liveSearchResult.totalConfiguredStores} lojas com preço ao vivo ·{' '}
                      {liveSearchResult.storesWithCouponCount}{' '}
                      {liveSearchResult.storesWithCouponCount === 1
                        ? 'loja com cupom ativo'
                        : 'lojas com cupom ativo'}
                      {liveSearchResult.lowestPrice != null && liveSearchResult.bestStoreName
                        ? ` · Menor preço: ${formatBRL(liveSearchResult.lowestPrice)} na ${liveSearchResult.bestStoreName}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void runLiveStoreSearch(liveSearchResult.query)}
                    className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0D0E12] text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-yellow-400/60 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar preços</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearLiveSearch}
                    className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Fechar</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {liveSearchResult.results.map((offer, idx) => {
                  const isBestPrice =
                    offer.foundLivePrice && offer.price !== null && idx === 0;
                  const topCoupon = offer.coupons[0];

                  return (
                    <div
                      key={offer.storeId}
                      className={`rounded-xl border p-4 flex flex-col justify-between gap-3.5 transition-colors ${
                        isBestPrice
                          ? 'border-amber-500/80 dark:border-yellow-400/70 bg-amber-50/40 dark:bg-yellow-400/[0.04]'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-[#0D0E12]'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Store Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{backgroundColor: offer.storeAccentHex}}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                                {offer.storeName}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                {offer.storeDomain}
                              </p>
                            </div>
                          </div>

                          {isBestPrice ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 dark:bg-yellow-400/20 text-amber-800 dark:text-yellow-300 text-[11px] font-bold whitespace-nowrap shrink-0">
                              Menor preço
                            </span>
                          ) : offer.foundLivePrice ? (
                            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
                              {offer.sourceLabel}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap shrink-0">
                              Busca direta
                            </span>
                          )}
                        </div>

                        {/* Matched Product Title & Price */}
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 line-clamp-2 min-h-[32px]">
                            {offer.productTitle}
                          </p>

                          {offer.foundLivePrice && offer.price !== null ? (
                            <div className="pt-0.5">
                              {offer.referencePrice && offer.referencePrice > offer.price && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-400 line-through font-mono-num">
                                    De {formatBRL(offer.referencePrice)}
                                  </span>
                                  {offer.discountPercent && offer.discountPercent >= 3 && (
                                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400 font-mono-num">
                                      -{Math.round(offer.discountPercent)}%
                                    </span>
                                  )}
                                </div>
                              )}
                              <p className="text-2xl font-extrabold font-mono-num text-amber-700 dark:text-yellow-400">
                                {formatBRL(offer.price)}
                              </p>
                              {offer.installments && (
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {offer.installments}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="pt-1">
                              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                                Consultar preço atualizado na loja
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Clique abaixo para abrir a busca de “{liveSearchResult.query}” na{' '}
                                {offer.storeName}.
                              </p>
                            </div>
                          )}

                          {offer.shipping && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1 pt-0.5">
                              <Truck className="w-3 h-3 text-amber-600 dark:text-yellow-400 shrink-0" />
                              <span>{offer.shipping}</span>
                            </p>
                          )}
                        </div>

                        {/* Coupons Section for this Store */}
                        <div className="space-y-2 pt-1">
                          {offer.coupons.length > 0 ? (
                            offer.coupons.map((cpn) => {
                              const copyKey = `${offer.storeId}:${cpn.code}`;
                              const copied = copiedStoreCouponKey === copyKey;
                              return (
                                <div
                                  key={copyKey}
                                  className="rounded-lg border border-dashed border-amber-500/70 dark:border-yellow-400/50 bg-amber-50/70 dark:bg-yellow-400/[0.07] p-2.5 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-yellow-300 min-w-0 truncate">
                                      <Ticket className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">
                                        {cpn.isProductSpecific
                                          ? 'Cupom para este produto'
                                          : 'Cupom ativo na loja'}
                                      </span>
                                    </span>
                                    <span className="font-mono-num font-bold text-red-600 dark:text-yellow-300 shrink-0">
                                      {cpn.discountLabel}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono-num text-xs font-extrabold tracking-wider text-zinc-950 dark:text-yellow-200 select-all truncate">
                                      {cpn.code}
                                    </span>
                                    {!cpn.isPageActivation ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleCopyStoreCoupon(
                                            offer.storeId,
                                            cpn.code,
                                            cpn.isPageActivation,
                                          )
                                        }
                                        className={`min-h-[26px] px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors shrink-0 ${
                                          copied
                                            ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                                            : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 hover:border-yellow-400'
                                        }`}
                                      >
                                        {copied ? (
                                          <>
                                            <Check className="w-3 h-3" />
                                            <span>Copiado</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copiar</span>
                                          </>
                                        )}
                                      </button>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-amber-800 dark:text-yellow-300 shrink-0">
                                        Ativar na página
                                      </span>
                                    )}
                                  </div>

                                  {(cpn.minPurchaseLabel || cpn.title) && (
                                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2">
                                      {cpn.title}
                                      {cpn.minPurchaseLabel &&
                                      cpn.minPurchaseLabel !== 'Ver regras na loja'
                                        ? ` · ${cpn.minPurchaseLabel}`
                                        : ''}
                                    </p>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                              Nenhum cupom compatível ativo na {offer.storeName} no momento.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Store Affiliate Action Button */}
                      <a
                        href={offer.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (topCoupon && !topCoupon.isPageActivation) {
                            void handleCopyStoreCoupon(
                              offer.storeId,
                              topCoupon.code,
                              topCoupon.isPageActivation,
                            );
                          }
                        }}
                        className={`w-full min-h-[40px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                          isBestPrice
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white'
                        }`}
                      >
                        <span>
                          {topCoupon
                            ? `Ir para ${offer.storeName} com Cupom`
                            : `Ver na ${offer.storeName}`}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* Announced Product Deals Grid (5-Minute Non-Repeating Cycles + Product-Specific Coupon + 3-Hour Auto-Delete) */}
      {visibleDeals.length === 0 ? (
        !liveSearchResult && !liveSearchLoading ? (
          <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
            <Search className="w-8 h-8 text-amber-600 dark:text-yellow-400 mx-auto" />
            <div className="space-y-1 max-w-lg mx-auto">
              <p className="text-base font-bold text-zinc-950 dark:text-white">
                {searchQuery.trim().length >= 2
                  ? `“${searchQuery.trim()}” ainda não apareceu nas ofertas de hoje`
                  : onlySaved
                    ? 'Nenhuma oferta salva está anunciada e ativa agora'
                    : onlyWithCoupon && announcedDeals.length > 0
                      ? 'Nenhuma oferta com cupom específico para este filtro'
                      : 'Nenhuma oferta anunciada ativa no momento'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {searchQuery.trim().length >= 2
                  ? 'Clique abaixo para buscar ao vivo o preço deste produto em todos os sites configurados no app e ver os cupons disponíveis em cada loja.'
                  : 'Novas ofertas inéditas com cupons específicos entram a cada 5 minutos sem repetir produtos. Você também pode buscar manualmente agora.'}
              </p>
            </div>
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
              {searchQuery.trim().length >= 2 ? (
                <button
                  type="button"
                  disabled={liveSearchLoading}
                  onClick={() => void runLiveStoreSearch(searchQuery)}
                  className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Buscar “{searchQuery.trim()}” em todas as lojas do app</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={searching}
                  onClick={() =>
                    void runManualDealSearch({query: searchQuery, category: categoryFilter})
                  }
                  className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>
                    {searching ? 'Pesquisando ofertas com cupom...' : 'Buscar Ofertas com Cupom Agora'}
                  </span>
                </button>
              )}
              {(searchQuery || categoryFilter !== 'all' || onlySaved || onlyWithCoupon) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setOnlySaved(false);
                    setOnlyWithCoupon(false);
                    setLiveSearchResult(null);
                  }}
                  className="min-h-[42px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Mostrar todas as ofertas
                </button>
              )}
            </div>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleDeals.map((deal) => {
            const discountPct = Math.round(deal.announcedDiscountPercent);
            const saved = isDealSaved(deal.productId);
            const remainingLabel = formatRemainingTtl(deal.expiresAt, nowMs);
            const isCopied = copiedDealId === deal.id;

            return (
              <article
                key={deal.id}
                className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col justify-between hover:border-yellow-400/60 transition-colors"
              >
                <div>
                  {/* Image & Discount Strip */}
                  <div className="relative bg-white aspect-[16/10] overflow-hidden border-b border-zinc-100 dark:border-zinc-800/80">
                    <ProductImage
                      src={deal.imageUrl}
                      alt={deal.productName}
                      className="w-full h-full object-contain p-3"
                    />
                    {discountPct >= 3 && (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-red-600 text-white font-mono-num text-xs font-bold shadow">
                        -{discountPct}% OFF
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          onRequireAuth('login');
                          return;
                        }
                        void toggleSaveDeal({
                          rawId: deal.productId,
                          dealType: 'product',
                          title: deal.productName,
                          storeOrAirline: deal.storeName,
                          price: deal.announcedPrice,
                          affiliateUrl: deal.affiliateUrl,
                        });
                      }}
                      aria-label={
                        saved
                          ? `Remover ${deal.productName} dos salvos`
                          : `Salvar ${deal.productName}`
                      }
                      className={`absolute top-3 right-3 min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center backdrop-blur-md transition-colors ${
                        saved
                          ? 'bg-yellow-400 text-zinc-950'
                          : 'bg-black/60 text-white hover:bg-black/80'
                      }`}
                    >
                      {saved ? (
                        <BookmarkCheck className="w-4 h-4" />
                      ) : (
                        <Bookmark className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Deal Content */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                        <Tag className="w-3 h-3 text-amber-600 dark:text-yellow-400" />
                        <span>{deal.category}</span>
                      </span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {deal.storeName}
                      </span>
                    </div>

                    <h2 className="text-sm font-bold text-zinc-950 dark:text-white leading-snug line-clamp-2 min-h-[40px]">
                      {deal.productName}
                    </h2>

                    <div className="space-y-0.5">
                      {deal.referencePrice > deal.announcedPrice && (
                        <p className="text-xs text-zinc-400 line-through font-mono-num">
                          De {formatBRL(deal.referencePrice)}
                        </p>
                      )}
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold font-mono-num text-amber-700 dark:text-yellow-400">
                          {formatBRL(deal.announcedPrice)}
                        </span>
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {deal.couponCode ? 'com cupom' : 'no Pix'}
                        </span>
                      </div>
                      {deal.installments && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          ou {deal.installments}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-yellow-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono-num">Expira em {remainingLabel}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                        <span>Postada {formatRelativeTime(deal.announcedAt)}</span>
                      </span>
                    </div>

                    {deal.shipping && (
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                        <span>{deal.shipping}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Product-Specific Coupon & Action Footer */}
                <div className="px-5 pb-5 pt-2 space-y-2.5">
                  {deal.couponCode && (
                    <div className="rounded-xl border border-dashed border-amber-500/70 dark:border-yellow-400/55 bg-amber-50/70 dark:bg-yellow-400/[0.07] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-yellow-300">
                          <Ticket className="w-3.5 h-3.5 shrink-0" />
                          <span>{deal.couponLabel || 'Cupom específico para este produto'}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-num text-sm font-extrabold tracking-wider text-zinc-950 dark:text-yellow-300 select-all truncate">
                          {deal.couponCode}
                        </span>
                        {!deal.couponIsPageActivation ? (
                          <button
                            type="button"
                            onClick={() => void handleCopyCoupon(deal)}
                            className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors shrink-0 ${
                              isCopied
                                ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 hover:border-yellow-400'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-800 dark:text-yellow-300 shrink-0">
                            Ativar na loja
                          </span>
                        )}
                      </div>

                      {deal.couponRule && (
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                          {deal.couponRule}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <a
                      href={deal.affiliateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (deal.couponCode && !deal.couponIsPageActivation) {
                          void handleCopyCoupon(deal);
                        }
                      }}
                      className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="truncate">
                        {deal.couponCode ? 'Pegar com Cupom' : 'Pegar Oferta'}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>

                    {(() => {
                      const shortAlertLabel = deal.productName.trim().slice(0, 80);
                      const isPrivateTracked = Boolean(
                        whatsappSubscription?.selectedProducts?.some(
                          (p) => p.toLowerCase() === shortAlertLabel.toLowerCase(),
                        ),
                      );
                      const isBusy = togglingAlertDealId === deal.id;
                      return (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async () => {
                            if (!user || !whatsappSubscription) {
                              onRequireAuth('login');
                              return;
                            }
                            setTogglingAlertDealId(deal.id);
                            try {
                              await togglePrivateProductAlert(shortAlertLabel);
                            } finally {
                              setTogglingAlertDealId(null);
                            }
                          }}
                          title={
                            isPrivateTracked
                              ? 'Produto escolhido para alertas no seu WhatsApp privado (clique para remover)'
                              : 'Escolher este produto para receber no seu WhatsApp privado'
                          }
                          aria-label={
                            isPrivateTracked
                              ? `Remover ${deal.productName} dos alertas privados`
                              : `Receber ${deal.productName} no WhatsApp privado`
                          }
                          className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
                            isPrivateTracked
                              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-400'
                          }`}
                        >
                          {isPrivateTracked ? (
                            <BellRing className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Bell className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="hidden sm:inline">
                            {isPrivateTracked ? 'No Privado' : 'Privado'}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
