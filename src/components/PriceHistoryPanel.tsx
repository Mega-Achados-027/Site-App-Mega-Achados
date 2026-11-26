import React, {useMemo, useState} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Table as TableIcon,
  TrendingDown,
} from 'lucide-react';
import type {MonitoredProduct, StoreConfig} from '../types.ts';
import {buildAffiliateUrl} from '../utils/affiliate.ts';
import {formatBRL, formatDateTime, formatPercent, formatShortDate} from '../utils/format.ts';
import {ProductImage} from './ProductImage.tsx';

interface PriceHistoryPanelProps {
  product: MonitoredProduct;
  stores: StoreConfig[];
  onUpdateRule: (
    productId: string,
    patch: Partial<
      Pick<
        MonitoredProduct,
        'targetMinPrice' | 'targetMaxPrice' | 'minDiscountPercent' | 'notifyWhatsApp' | 'notifyPush' | 'active'
      >
    >,
  ) => Promise<void>;
  onForceScan: (productId: string) => Promise<void>;
  onShareProduct: (product: MonitoredProduct) => void;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';
type DisplayMode = 'both' | 'chart' | 'table';

export const PriceHistoryPanel: React.FC<PriceHistoryPanelProps> = ({
  product,
  stores,
  onUpdateRule,
  onForceScan,
  onShareProduct,
}) => {
  const [range, setRange] = useState<TimeRange>('90d');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [editingRule, setEditingRule] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [minPrice, setMinPrice] = useState(String(product.targetMinPrice));
  const [maxPrice, setMaxPrice] = useState(String(product.targetMaxPrice));
  const [minDiscount, setMinDiscount] = useState(String(product.minDiscountPercent));
  const [notifyWA, setNotifyWA] = useState(product.notifyWhatsApp);
  const [notifyPush, setNotifyPush] = useState(product.notifyPush);
  const [savingRule, setSavingRule] = useState(false);

  React.useEffect(() => {
    setMinPrice(String(product.targetMinPrice));
    setMaxPrice(String(product.targetMaxPrice));
    setMinDiscount(String(product.minDiscountPercent));
    setNotifyWA(product.notifyWhatsApp);
    setNotifyPush(product.notifyPush);
    setEditingRule(false);
    setStoreFilter('all');
  }, [
    product.id,
    product.targetMinPrice,
    product.targetMaxPrice,
    product.minDiscountPercent,
    product.notifyWhatsApp,
    product.notifyPush,
  ]);

  const storeMap = useMemo(() => {
    const map = new Map<string, StoreConfig>();
    stores.forEach((s) => map.set(s.id, s));
    return map;
  }, [stores]);

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      range === '7d'
        ? now - 7 * 86400000
        : range === '30d'
          ? now - 30 * 86400000
          : range === '90d'
            ? now - 90 * 86400000
            : 0;

    return product.history
      .filter((pt) => {
        const ts = new Date(pt.timestamp).getTime();
        if (cutoffMs > 0 && ts < cutoffMs) return false;
        if (storeFilter !== 'all' && pt.storeId !== storeFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [product.history, range, storeFilter]);

  const chartData = useMemo(
    () =>
      filteredHistory.map((pt) => ({
        ...pt,
        shortDate: formatShortDate(pt.timestamp),
        fullDate: formatDateTime(pt.timestamp),
      })),
    [filteredHistory],
  );

  const tableRows = useMemo(() => [...filteredHistory].reverse(), [filteredHistory]);

  const bestOffer = useMemo(() => {
    if (product.offers.length === 0) return null;
    return [...product.offers].sort((a, b) => a.pixPrice - b.pixPrice)[0];
  }, [product.offers]);

  const bestAffiliateUrl = bestOffer
    ? buildAffiliateUrl(bestOffer.rawUrl, storeMap.get(bestOffer.storeId))
    : '';

  const discountVsAvg =
    product.avgPrice > 0
      ? Number((((product.avgPrice - product.bestPrice) / product.avgPrice) * 100).toFixed(1))
      : 0;

  const isWithinTarget =
    product.bestPrice >= product.targetMinPrice && product.bestPrice <= product.targetMaxPrice;

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRule(true);
    try {
      const parsedMin = Math.max(1, Number(minPrice) || product.targetMinPrice);
      const parsedMax = Math.max(parsedMin + 1, Number(maxPrice) || product.targetMaxPrice);
      const parsedDisc = Math.max(1, Number(minDiscount) || product.minDiscountPercent);
      await onUpdateRule(product.id, {
        targetMinPrice: parsedMin,
        targetMaxPrice: parsedMax,
        minDiscountPercent: parsedDisc,
        notifyWhatsApp: notifyWA,
        notifyPush,
      });
      setEditingRule(false);
    } finally {
      setSavingRule(false);
    }
  };

  const handleScanClick = async () => {
    setScanning(true);
    try {
      await onForceScan(product.id);
    } finally {
      setScanning(false);
    }
  };

  const uniqueHistoryStores = useMemo(() => {
    const seen = new Map<string, string>();
    product.history.forEach((pt) => seen.set(pt.storeId, pt.storeName));
    return Array.from(seen.entries());
  }, [product.history]);

  return (
    <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header Summary */}
      <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-20 h-20 rounded-xl shrink-0 border border-zinc-200 dark:border-zinc-800"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>{product.brand}</span>
                <span aria-hidden="true">·</span>
                <span>{product.offers.length} lojas monitoradas</span>
              </div>
              <h2 className="mt-1 text-lg sm:text-xl font-semibold text-zinc-950 dark:text-white leading-snug">
                {product.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                  {formatBRL(product.bestPrice)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Melhor preço no PIX em{' '}
                  <strong className="font-medium text-zinc-900 dark:text-zinc-200">
                    {bestOffer?.storeName || '—'}
                  </strong>
                </span>
                {discountVsAvg > 0 && (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 font-mono-num">
                    -{discountVsAvg.toFixed(1).replace('.', ',')}% abaixo da média
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleScanClick}
              disabled={scanning}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Verificando...' : 'Checar Preço'}</span>
            </button>
            <button
              type="button"
              onClick={() => onShareProduct(product)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Compartilhar</span>
            </button>
            {bestAffiliateUrl && (
              <a
                href={bestAffiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Ir à Oferta (Afiliado)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Key Historical Metrics Strip */}
        <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Menor Histórico</p>
            <p className="mt-0.5 text-base font-semibold font-mono-num text-amber-700 dark:text-yellow-400">
              {formatBRL(product.allTimeLow)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Preço Médio</p>
            <p className="mt-0.5 text-base font-semibold font-mono-num text-zinc-950 dark:text-white">
              {formatBRL(product.avgPrice)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Maior Histórico</p>
            <p className="mt-0.5 text-base font-semibold font-mono-num text-zinc-950 dark:text-white">
              {formatBRL(product.allTimeHigh)}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Faixa de Alerta</p>
              <button
                type="button"
                onClick={() => setEditingRule((v) => !v)}
                className="text-xs font-medium text-red-600 dark:text-yellow-400 hover:underline flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{editingRule ? 'Fechar' : 'Editar'}</span>
              </button>
            </div>
            <p className="mt-0.5 text-sm font-semibold font-mono-num text-zinc-950 dark:text-white">
              {formatBRL(product.targetMinPrice)} – {formatBRL(product.targetMaxPrice)}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {isWithinTarget ? 'Dentro da faixa agora' : `Avisa até ${formatBRL(product.targetMaxPrice)}`}
            </p>
          </div>
        </div>

        {/* Inline Price Range Rule Editor */}
        {editingRule && (
          <form
            onSubmit={handleSaveRule}
            className="mt-5 pt-5 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                Preço mínimo (R$)
              </label>
              <input
                type="number"
                min={1}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                Preço máximo alvo (R$)
              </label>
              <input
                type="number"
                min={10}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                Desconto mín. (%)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={minDiscount}
                onChange={(e) => setMinDiscount(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                <label className="flex items-center gap-1.5 cursor-pointer min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={notifyWA}
                    onChange={(e) => setNotifyWA(e.target.checked)}
                    className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
                  />
                  <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>WhatsApp</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={notifyPush}
                    onChange={(e) => setNotifyPush(e.target.checked)}
                    className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
                  />
                  <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                  <span>Push</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={savingRule}
                className="min-h-[40px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                {savingRule ? 'Salvando...' : 'Salvar Faixa'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Controls Bar for Price History */}
      <div className="px-5 sm:px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70 dark:bg-[#0B0C10]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 mr-1">
            Histórico de Preços
          </span>
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-900">
            {(
              [
                {id: '7d', label: '7D'},
                {id: '30d', label: '30D'},
                {id: '90d', label: '90D'},
                {id: 'all', label: 'Tudo'},
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  range === opt.id
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar histórico por loja"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
          >
            <option value="all">Todas as lojas ({uniqueHistoryStores.length})</option>
            {uniqueHistoryStores.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Display Mode: Chart / Table / Both */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-900">
          {(
            [
              {id: 'both', label: 'Gráfico + Tabela'},
              {id: 'chart', label: 'Gráfico'},
              {id: 'table', label: 'Tabela'},
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDisplayMode(mode.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                displayMode === mode.id
                  ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Chart Section */}
      {(displayMode === 'both' || displayMode === 'chart') && (
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              <span>Evolução de preço no PIX</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{chartData.length} registros</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-yellow-400" />
                Preço registrado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0 border-t border-dashed border-red-500" />
                Alvo ({formatBRL(product.targetMaxPrice)})
              </span>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum registro de preço encontrado para este filtro.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{top: 10, right: 12, left: 4, bottom: 0}}>
                  <defs>
                    <linearGradient id={`priceFill-${product.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FACC15" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#FACC15" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.16)" vertical={false} />
                  <XAxis
                    dataKey="shortDate"
                    tick={{fontSize: 11, fill: '#71717A'}}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{fontSize: 11, fill: '#71717A'}}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => `R$ ${Math.round(v)}`}
                  />
                  <Tooltip
                    content={({active, payload}) => {
                      if (!active || !payload || !payload[0]) return null;
                      const pt = payload[0].payload as typeof chartData[number];
                      return (
                        <div className="rounded-xl bg-[#07070A] text-white px-3.5 py-2.5 shadow-xl border border-zinc-800 text-xs">
                          <p className="font-medium text-zinc-200">{pt.fullDate}</p>
                          <p className="text-zinc-400 mt-0.5">{pt.storeName}</p>
                          <p className="mt-1.5 text-base font-bold font-mono-num text-yellow-400">
                            {formatBRL(pt.price)}
                          </p>
                          <p
                            className={`text-[11px] font-mono-num ${
                              pt.deltaValue <= 0 ? 'text-yellow-300' : 'text-red-400'
                            }`}
                          >
                            {pt.deltaValue <= 0 ? 'Queda de ' : 'Alta de '}
                            {formatBRL(Math.abs(pt.deltaValue))} ({formatPercent(pt.deltaPercent)})
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={product.targetMaxPrice}
                    stroke="#EF4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#EAB308"
                    strokeWidth={2.2}
                    fill={`url(#priceFill-${product.id})`}
                    activeDot={{r: 5, fill: '#FACC15', stroke: '#09090B', strokeWidth: 2}}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Detailed Chronological Price Fluctuations Table */}
      {(displayMode === 'both' || displayMode === 'table') && (
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <TableIcon className="w-3.5 h-3.5 text-zinc-500" />
              <span>Tabela Detalhada de Flutuações de Preço</span>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
              Mostrando {Math.min(tableRows.length, 25)} de {tableRows.length} variações
            </span>
          </div>

          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  <th className="py-2.5 pl-5 sm:pl-2 pr-3">Data e Hora</th>
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3 text-right">Anterior</th>
                  <th className="py-2.5 px-3 text-right">Preço Registrado</th>
                  <th className="py-2.5 px-3 text-right">Flutuação</th>
                  <th className="py-2.5 pl-3 pr-5 sm:pr-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                {tableRows.slice(0, 25).map((row) => {
                  const store = storeMap.get(row.storeId);
                  const affUrl = buildAffiliateUrl(row.rawUrl, store);
                  const isDrop = row.deltaValue < 0;
                  const isRise = row.deltaValue > 0;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="py-2.5 pl-5 sm:pl-2 pr-3 font-mono-num text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatDateTime(row.timestamp)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                        {row.storeName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                        {formatBRL(row.previousPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-zinc-950 dark:text-white whitespace-nowrap">
                        {formatBRL(row.price)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-end gap-1 font-medium ${
                            isDrop
                              ? 'text-amber-700 dark:text-yellow-400'
                              : isRise
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {isDrop && <ArrowDownRight className="w-3.5 h-3.5" />}
                          {isRise && <ArrowUpRight className="w-3.5 h-3.5" />}
                          <span>
                            {isDrop ? '-' : isRise ? '+' : ''}
                            {formatBRL(Math.abs(row.deltaValue))} ({formatPercent(row.deltaPercent)})
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 pr-5 sm:pr-2 text-right whitespace-nowrap">
                        <a
                          href={affUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 dark:text-yellow-400 hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>Ver oferta</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
