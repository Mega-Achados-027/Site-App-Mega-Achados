import React, {useMemo, useState} from 'react';
import {
  Check,
  ExternalLink,
  MessageCircle,
  Search,
  Share2,
  Truck,
} from 'lucide-react';
import type {BotConfig, MonitoredProduct, StoreConfig} from '../types.ts';
import {
  buildAffiliateUrl,
  buildWhatsAppDeepLink,
  formatWhatsAppPromoMessage,
} from '../utils/affiliate.ts';
import {formatBRL, formatRelativeTime} from '../utils/format.ts';
import {ProductImage} from './ProductImage.tsx';

interface QuickCompareViewProps {
  products: MonitoredProduct[];
  stores: StoreConfig[];
  botConfig: BotConfig;
  initialProductId?: string;
  onShareProduct: (product: MonitoredProduct, storeId?: string) => void;
}

export const QuickCompareView: React.FC<QuickCompareViewProps> = ({
  products,
  stores,
  botConfig,
  initialProductId,
  onShareProduct,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(initialProductId || products[0]?.id || '');

  const storeMap = useMemo(() => {
    const map = new Map<string, StoreConfig>();
    stores.forEach((s) => map.set(s.id, s));
    return map;
  }, [stores]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q),
    );
  }, [products, search]);

  const activeProduct =
    products.find((p) => p.id === selectedId) || filteredProducts[0] || products[0];

  const sortedOffers = useMemo(() => {
    if (!activeProduct) return [];
    const activeStoreSet = new Set(stores.filter((s) => s.active).map((s) => s.id));
    return [...activeProduct.offers]
      .filter((o) => activeStoreSet.has(o.storeId))
      .sort((a, b) => a.pixPrice + a.shippingCost - (b.pixPrice + b.shippingCost));
  }, [activeProduct, stores]);

  const bestTotal =
    sortedOffers.length > 0 ? sortedOffers[0].pixPrice + sortedOffers[0].shippingCost : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Comparador Rápido entre Varejistas
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Compare preço à vista no PIX, parcelamento, frete e economia real com seu link de afiliado já aplicado.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar produto..."
            className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
          />
        </div>
      </div>

      {/* Product Selector Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filteredProducts.map((prod) => {
          const isSelected = activeProduct?.id === prod.id;
          return (
            <button
              key={prod.id}
              type="button"
              onClick={() => setSelectedId(prod.id)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left transition-colors shrink-0 flex items-center gap-2.5 ${
                isSelected
                  ? 'border-yellow-400 bg-amber-50/70 dark:bg-yellow-400/10 text-zinc-950 dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              <ProductImage src={prod.imageUrl} alt={prod.name} className="w-8 h-8 rounded-lg shrink-0" />
              <div className="max-w-[200px]">
                <p className="text-xs font-semibold truncate">{prod.name}</p>
                <p className="text-[11px] font-mono-num text-amber-700 dark:text-yellow-400">
                  {formatBRL(prod.bestPrice)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Comparison Matrix */}
      {activeProduct ? (
        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ProductImage
                src={activeProduct.imageUrl}
                alt={activeProduct.name}
                className="w-16 h-16 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0"
              />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {activeProduct.category} · {sortedOffers.length} lojas ativas comparadas
                </p>
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                  {activeProduct.name}
                </h2>
              </div>
            </div>
            {sortedOffers.length >= 2 && (
              <div className="text-left sm:text-right">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Diferença entre menor e maior oferta
                </p>
                <p className="text-lg font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                  Economia de{' '}
                  {formatBRL(
                    sortedOffers[sortedOffers.length - 1].pixPrice - sortedOffers[0].pixPrice,
                  )}
                </p>
              </div>
            )}
          </div>

          {sortedOffers.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Nenhuma loja ativa disponível para comparar este produto. Ative lojas em Lojas & Afiliados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0B0C10] text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <th className="py-3 pl-6 pr-3">Varejista</th>
                    <th className="py-3 px-3 text-right">Preço PIX</th>
                    <th className="py-3 px-3 text-right">Parcelado</th>
                    <th className="py-3 px-3">Frete</th>
                    <th className="py-3 px-3 text-right">Total c/ Frete</th>
                    <th className="py-3 px-3 text-right">Diferença</th>
                    <th className="py-3 pl-3 pr-6 text-right">Ações (Link Afiliado)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                  {sortedOffers.map((offer, idx) => {
                    const store = storeMap.get(offer.storeId);
                    const total = offer.pixPrice + offer.shippingCost;
                    const diff = total - bestTotal;
                    const isBest = idx === 0;
                    const affiliateUrl = buildAffiliateUrl(offer.rawUrl, store);
                    const waMsg = formatWhatsAppPromoMessage({
                      template: botConfig.whatsappTemplate,
                      productName: activeProduct.name,
                      storeName: offer.storeName,
                      oldPrice: activeProduct.avgPrice,
                      newPrice: offer.pixPrice,
                      discountPercent: Math.max(
                        0,
                        ((activeProduct.avgPrice - offer.pixPrice) / activeProduct.avgPrice) * 100,
                      ),
                      affiliateUrl,
                    });
                    const waHref = buildWhatsAppDeepLink(botConfig.whatsappPhone, waMsg);

                    return (
                      <tr
                        key={offer.storeId}
                        className={
                          isBest
                            ? 'bg-amber-50/50 dark:bg-yellow-400/[0.06]'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors'
                        }
                      >
                        <td className="py-4 pl-6 pr-3">
                          <div className="font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                            <span>{offer.storeName}</span>
                            {isBest && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-yellow-400">
                                <Check className="w-3.5 h-3.5" />
                                Menor preço
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {store?.affiliateTag
                              ? `Afiliado: ${store.affiliateTag}`
                              : 'Sem tag de afiliado'}
                            {' · '}
                            {formatRelativeTime(offer.updatedAt)}
                          </p>
                        </td>
                        <td className="py-4 px-3 text-right font-mono-num font-bold text-zinc-950 dark:text-white whitespace-nowrap">
                          {formatBRL(offer.pixPrice)}
                        </td>
                        <td className="py-4 px-3 text-right whitespace-nowrap">
                          <div className="font-mono-num text-zinc-700 dark:text-zinc-300">
                            {formatBRL(offer.price)}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {offer.installments}
                          </div>
                        </td>
                        <td className="py-4 px-3 text-xs text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-zinc-400" />
                            {offer.shipping}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-right font-mono-num font-semibold text-zinc-950 dark:text-white whitespace-nowrap">
                          {formatBRL(total)}
                        </td>
                        <td className="py-4 px-3 text-right font-mono-num text-xs whitespace-nowrap">
                          {isBest ? (
                            <span className="font-semibold text-amber-700 dark:text-yellow-400">
                              Melhor achado
                            </span>
                          ) : (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              +{formatBRL(diff)}
                            </span>
                          )}
                        </td>
                        <td className="py-4 pl-3 pr-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Enviar oferta no WhatsApp com seu link de afiliado"
                              className="min-h-[36px] px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                              <span>WhatsApp</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => onShareProduct(activeProduct, offer.storeId)}
                              title="Compartilhar nas redes sociais"
                              className="min-h-[36px] min-w-[36px] rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center transition-colors"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={affiliateUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                                isBest
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-zinc-900 dark:bg-zinc-800 hover:opacity-90 text-white'
                              }`}
                            >
                              <span>Ir à Loja</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
