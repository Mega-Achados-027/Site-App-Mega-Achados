import React, {useMemo, useState} from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Instagram,
  Link2,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import type {BotConfig, MonitoredProduct, StoreConfig} from '../types.ts';
import {
  buildAffiliateUrl,
  buildWhatsAppDeepLink,
  formatWhatsAppPromoMessage,
} from '../utils/affiliate.ts';
import {formatBRL} from '../utils/format.ts';
import {ProductImage} from './ProductImage.tsx';

interface ShareDealModalProps {
  product: MonitoredProduct;
  stores: StoreConfig[];
  botConfig: BotConfig;
  initialStoreId?: string;
  onClose: () => void;
}

type SocialChannel = 'whatsapp' | 'x' | 'telegram' | 'instagram' | 'facebook';

const BRAND_LOGO = '/assets/aistudio/ChatGPT_Image_17_de_set._de_2026__08_48_50_36447620.png';

export const ShareDealModal: React.FC<ShareDealModalProps> = ({
  product,
  stores,
  botConfig,
  initialStoreId,
  onClose,
}) => {
  const bestOffer = useMemo(() => {
    if (initialStoreId) {
      const found = product.offers.find((o) => o.storeId === initialStoreId);
      if (found) return found;
    }
    return [...product.offers].sort((a, b) => a.pixPrice - b.pixPrice)[0];
  }, [product.offers, initialStoreId]);

  const [selectedStoreId, setSelectedStoreId] = useState(bestOffer?.storeId || '');
  const [channel, setChannel] = useState<SocialChannel>('whatsapp');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const selectedOffer =
    product.offers.find((o) => o.storeId === selectedStoreId) || bestOffer;
  const store = stores.find((s) => s.id === selectedOffer?.storeId);
  const affiliateUrl = selectedOffer
    ? buildAffiliateUrl(selectedOffer.rawUrl, store)
    : '';
  const discountPct =
    selectedOffer && product.avgPrice > selectedOffer.pixPrice
      ? Number(
          (((product.avgPrice - selectedOffer.pixPrice) / product.avgPrice) * 100).toFixed(1),
        )
      : 10;

  const promoCopy = useMemo(() => {
    if (!selectedOffer) return '';
    if (channel === 'whatsapp') {
      return formatWhatsAppPromoMessage({
        template: botConfig.whatsappTemplate,
        productName: product.name,
        storeName: selectedOffer.storeName,
        oldPrice: product.avgPrice,
        newPrice: selectedOffer.pixPrice,
        discountPercent: discountPct,
        affiliateUrl,
      });
    }
    if (channel === 'x') {
      return `Mega Achados 027: ${product.name} por ${formatBRL(selectedOffer.pixPrice)} no PIX (${Math.round(discountPct)}% OFF) na ${selectedOffer.storeName}. Link: ${affiliateUrl} #megaachados027 #promocao`;
    }
    if (channel === 'instagram') {
      return `${product.name}\nDe ${formatBRL(product.avgPrice)} por ${formatBRL(selectedOffer.pixPrice)} no PIX (${Math.round(discountPct)}% OFF) na ${selectedOffer.storeName}.\n\nLink da oferta (Mega Achados 027):\n${affiliateUrl}`;
    }
    return `Mega Achados 027 encontrou: ${product.name} por ${formatBRL(selectedOffer.pixPrice)} na ${selectedOffer.storeName} (${Math.round(discountPct)}% OFF).\n\nAcesse aqui: ${affiliateUrl}`;
  }, [channel, selectedOffer, product, botConfig.whatsappTemplate, discountPct, affiliateUrl]);

  const [customText, setCustomText] = useState(promoCopy);
  React.useEffect(() => {
    setCustomText(promoCopy);
  }, [promoCopy]);

  const shareUrl = useMemo(() => {
    const encodedText = encodeURIComponent(customText);
    const encodedLink = encodeURIComponent(affiliateUrl);
    switch (channel) {
      case 'whatsapp':
        return buildWhatsAppDeepLink('', customText);
      case 'x':
        return `https://twitter.com/intent/tweet?text=${encodedText}`;
      case 'telegram':
        return `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`;
      case 'facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}&quote=${encodedText}`;
      case 'instagram':
        return '';
    }
  }, [channel, customText, affiliateUrl]);

  const copyValue = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: `Mega Achados 027 — ${product.name}`,
          text: customText,
          url: affiliateUrl,
        });
      } catch {
        // User cancelled share
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Compartilhar Promoção com Seu Afiliado
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {store?.affiliateTag
                ? `Link gerado automaticamente com sua tag ${store.affiliateTag} (${store.name}).`
                : 'Configure sua tag em Lojas & Afiliados para monetizar este link.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Store Selection */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-12 h-12 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                {product.name}
              </p>
              <p className="text-xs font-mono-num text-amber-700 dark:text-yellow-400 font-semibold">
                {formatBRL(selectedOffer?.pixPrice || product.bestPrice)} · {Math.round(discountPct)}% OFF
              </p>
            </div>
          </div>

          <select
            aria-label="Selecionar loja para compartilhar"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="min-h-[36px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-medium text-zinc-800 dark:text-zinc-200"
          >
            {product.offers.map((o) => (
              <option key={o.storeId} value={o.storeId}>
                {o.storeName} ({formatBRL(o.pixPrice)})
              </option>
            ))}
          </select>
        </div>

        {/* Channel Selector */}
        <div className="mt-4">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#0B0C10] w-full">
            {(
              [
                {id: 'whatsapp', label: 'WhatsApp'},
                {id: 'x', label: 'X / Twitter'},
                {id: 'telegram', label: 'Telegram'},
                {id: 'instagram', label: 'Instagram'},
                {id: 'facebook', label: 'Facebook'},
              ] as const
            ).map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChannel(ch.id)}
                className={`flex-1 min-h-[34px] px-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  channel === ch.id
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Instagram Visual Story Card Preview with Mega Achados 027 branding */}
        {channel === 'instagram' && selectedOffer && (
          <div className="mt-4 rounded-2xl bg-[#07070A] text-white p-5 flex items-center gap-4 border border-yellow-400/30">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="w-20 h-20 rounded-xl shrink-0 border border-zinc-800"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <img
                  src={BRAND_LOGO}
                  alt="Mega Achados 027"
                  className="w-6 h-6 rounded-md object-cover shrink-0"
                />
                <p className="text-[11px] font-semibold text-yellow-400">
                  Mega Achados 027 · {selectedOffer.storeName}
                </p>
              </div>
              <p className="mt-1 text-sm font-semibold line-clamp-2">{product.name}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono-num text-yellow-400">
                  {formatBRL(selectedOffer.pixPrice)}
                </span>
                <span className="text-xs font-mono-num text-zinc-400 line-through">
                  {formatBRL(product.avgPrice)}
                </span>
                <span className="text-xs font-bold text-red-400">
                  -{Math.round(discountPct)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Affiliate URL Box */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
              Link de Afiliado Gerado
            </span>
            <button
              type="button"
              onClick={() => void copyValue('link', affiliateUrl)}
              className="text-red-600 dark:text-yellow-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              {copiedKey === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'link' ? 'Link copiado' : 'Copiar link'}</span>
            </button>
          </div>
          <div className="px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-amber-700 dark:text-yellow-400 break-all">
            {affiliateUrl}
          </div>
        </div>

        {/* Editable Social Copy */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Texto da Publicação
          </label>
          <textarea
            rows={5}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void copyValue('copy', customText)}
            className="min-h-[42px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            {copiedKey === 'copy' ? <Check className="w-4 h-4 text-yellow-500" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey === 'copy' ? 'Texto Copiado' : 'Copiar Mensagem'}</span>
          </button>

          <div className="flex items-center gap-2">
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Compartilhar</span>
              </button>
            )}

            {channel === 'instagram' ? (
              <button
                type="button"
                onClick={() => void copyValue('ig', customText)}
                className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Instagram className="w-4 h-4" />
                <span>{copiedKey === 'ig' ? 'Legenda Copiada!' : 'Copiar para Stories'}</span>
              </button>
            ) : (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                {channel === 'whatsapp' ? (
                  <MessageCircle className="w-4 h-4" />
                ) : channel === 'telegram' ? (
                  <Send className="w-4 h-4" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                <span>Publicar no {channel === 'x' ? 'X' : channel.charAt(0).toUpperCase() + channel.slice(1)}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
