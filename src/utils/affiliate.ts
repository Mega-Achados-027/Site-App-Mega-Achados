import type {AffiliateMode, StoreConfig} from '../types.ts';

const ML_TRACKING_PARAMS = [
  'matt_word',
  'matt_tool',
  'matt_source',
  'matt_campaign',
  'matt_ad_group',
  'matt_ad',
  'matt_match_type',
  'matt_network',
  'matt_device',
  'matt_creative',
  'matt_keyword',
  'forceInApp',
  'ref',
];

const SHORT_AFFILIATE_HOSTS = new Set([
  'meli.la',
  'amzn.to',
  'a.co',
  'shp.ee',
  's.shopee.com.br',
  'divulgador.magalu.com',
  'magalu.lu',
]);

export function isShortAffiliateUrl(inputUrl: string): boolean {
  const trimmed = inputUrl.trim();
  if (!trimmed) return false;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (SHORT_AFFILIATE_HOSTS.has(host)) return true;
    if (
      (host === 'mercadolivre.com' || host === 'mercadolivre.com.br') &&
      parsed.pathname.toLowerCase().startsWith('/sec/')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isAlreadyOfficialMlAffiliateUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'meli.la') return true;
  if (
    (host === 'mercadolivre.com' || host === 'mercadolivre.com.br') &&
    parsed.pathname.toLowerCase().startsWith('/sec/')
  ) {
    return true;
  }
  if (
    (host.includes('mercadolivre.') || host.includes('mercadolibre.')) &&
    parsed.pathname.toLowerCase().startsWith('/social/') &&
    parsed.searchParams.has('ref')
  ) {
    return true;
  }
  return false;
}

/**
 * Generates an affiliate-tagged URL for a given raw product URL and store configuration.
 * Ensures every link dispatched via WhatsApp, Push, Social Share, or direct clicks
 * always carries the user's configured affiliate tag/ID.
 */
export function buildAffiliateUrl(rawUrl: string, store?: StoreConfig | null): string {
  if (!rawUrl) return '';
  if (!store || !store.affiliateTag.trim()) {
    return rawUrl;
  }

  const tag = store.affiliateTag.trim();
  const param = (store.affiliateParam || 'ref').trim();

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // Preserve official Mercado Livre affiliate links (meli.la, /sec/, or /social/...&ref=...) untouched
    if (isAlreadyOfficialMlAffiliateUrl(parsed)) {
      return parsed.toString();
    }

    if (store.affiliateMode === 'template' && store.affiliateTemplate.trim()) {
      return store.affiliateTemplate
        .replace(/\{url\}/g, encodeURIComponent(rawUrl))
        .replace(/\{raw_url\}/g, rawUrl)
        .replace(/\{id\}/g, encodeURIComponent(tag))
        .replace(/\{tag\}/g, encodeURIComponent(tag))
        .replace(/\{path\}/g, parsed.pathname.replace(/^\//, ''));
    }

    if (store.affiliateMode === 'path_prefix') {
      if (store.affiliateTemplate.trim()) {
        return store.affiliateTemplate
          .replace(/\{id\}/g, encodeURIComponent(tag))
          .replace(/\{tag\}/g, encodeURIComponent(tag))
          .replace(/\{path\}/g, parsed.pathname.replace(/^\//, ''));
      }
      const cleanPath = parsed.pathname.replace(/^\//, '');
      parsed.pathname = `/${encodeURIComponent(tag)}/${cleanPath}`;
      return parsed.toString();
    }

    const isMercadoLivre =
      store.id === 'mercadolivre' ||
      host.includes('mercadolivre.') ||
      host.includes('mercadolibre.');

    if (isMercadoLivre) {
      // Remove any stale or third-party Mercado Livre tracking parameters before injecting our own
      for (const key of ML_TRACKING_PARAMS) {
        parsed.searchParams.delete(key);
      }

      // If user pasted a full ML /social/ or product URL directly into affiliateTag, extract params safely
      if (/^https?:\/\//i.test(tag)) {
        try {
          const tagUrl = new URL(tag);
          const mlWord =
            tagUrl.searchParams.get('matt_word') ||
            tagUrl.pathname.match(/^\/social\/([^/?#]+)/i)?.[1] ||
            '';
          const mlTool = tagUrl.searchParams.get('matt_tool') || '';
          const forceInApp = tagUrl.searchParams.get('forceInApp') || 'true';
          if (mlWord) parsed.searchParams.set('matt_word', mlWord);
          if (mlTool) parsed.searchParams.set('matt_tool', mlTool);
          if (mlWord || mlTool) parsed.searchParams.set('forceInApp', forceInApp);
          return parsed.toString();
        } catch {
          // Fall through to standard parsing
        }
      }

      if (tag.includes('=')) {
        const extraParams = new URLSearchParams(tag);
        extraParams.forEach((value, key) => {
          // Never copy a single-product encrypted `ref` token onto other products
          if (key.toLowerCase() === 'ref') return;
          if (value.trim()) {
            parsed.searchParams.set(key, value.trim());
          }
        });
      } else {
        parsed.searchParams.set(param || 'matt_word', tag);
      }

      if (
        (parsed.searchParams.has('matt_word') || parsed.searchParams.has('matt_tool')) &&
        !parsed.searchParams.has('forceInApp')
      ) {
        parsed.searchParams.set('forceInApp', 'true');
      }

      return parsed.toString();
    }

    // Default: query parameter injection (supports multi-param strings like "matt_tool=123&matt_word=abc")
    if (tag.includes('=')) {
      const extraParams = new URLSearchParams(tag);
      extraParams.forEach((value, key) => {
        parsed.searchParams.set(key, value);
      });
    } else {
      parsed.searchParams.set(param, tag);
    }

    return parsed.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}${encodeURIComponent(param)}=${encodeURIComponent(tag)}`;
  }
}

export interface DetectedAffiliateInfo {
  storeId: string | null;
  storeName: string;
  affiliateMode: AffiliateMode;
  affiliateParam: string;
  affiliateTag: string;
  affiliateTemplate?: string;
  explanation: string;
}

/**
 * Inspects an existing affiliate URL pasted by the user and automatically extracts
 * the store, parameter name, affiliate tag/ID, and conversion mode.
 */
export function extractAffiliateInfoFromUrl(inputUrl: string): DetectedAffiliateInfo | null {
  const trimmed = inputUrl.trim();
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const params = parsed.searchParams;

    // 1. Amazon Associados
    if (host.includes('amazon.')) {
      const tag = params.get('tag') || params.get('ascsubtag');
      if (tag) {
        return {
          storeId: 'amazon',
          storeName: 'Amazon BR',
          affiliateMode: 'query',
          affiliateParam: 'tag',
          affiliateTag: tag,
          explanation: `Tag Amazon Associados encontrada no parâmetro "?tag=${tag}".`,
        };
      }
    }

    // 2. Magazine Você (Parceiro Magalu)
    if (host.includes('magazinevoce.com.br')) {
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
      if (firstSegment) {
        return {
          storeId: 'magalu',
          storeName: 'Magazine Luiza',
          affiliateMode: 'path_prefix',
          affiliateParam: 'partner_id',
          affiliateTag: firstSegment,
          affiliateTemplate: 'https://www.magazinevoce.com.br/{id}/{path}',
          explanation: `Nome da sua vitrine Parceiro Magalu detectado após magazinevoce.com.br/: "${firstSegment}".`,
        };
      }
    }

    // 3. Awin (KaBuM! / grandes varejistas)
    if (host.includes('awin1.com') || params.has('awinaffid')) {
      const affId = params.get('awinaffid');
      const mid = params.get('awinmid') || '17729';
      if (affId) {
        return {
          storeId: mid === '17729' ? 'kabum' : null,
          storeName: mid === '17729' ? 'KaBuM!' : 'Rede Awin',
          affiliateMode: 'template',
          affiliateParam: 'awinaffid',
          affiliateTag: affId,
          affiliateTemplate: `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid={id}&ued={url}`,
          explanation: `Publisher ID da rede Awin extraído ("${affId}") com anunciante awinmid=${mid}.`,
        };
      }
    }

    // 4. Mercado Livre Afiliados (suporta links diretos, /social/{etiqueta} e meli.la expandidos)
    if (host.includes('mercadolivre.') || host.includes('mercadolibre.')) {
      const socialSlug = parsed.pathname.match(/^\/social\/([^/?#]+)/i)?.[1] || null;
      const mattWord = params.get('matt_word') || socialSlug;
      const mattTool = params.get('matt_tool');
      const forceInApp = params.get('forceInApp') || 'true';
      if (mattTool && mattWord) {
        return {
          storeId: 'mercadolivre',
          storeName: 'Mercado Livre',
          affiliateMode: 'query',
          affiliateParam: 'matt_word',
          affiliateTag: `matt_word=${mattWord}&matt_tool=${mattTool}&forceInApp=${forceInApp}`,
          affiliateTemplate: '{raw_url}?{id}',
          explanation: `Parâmetros completos do Mercado Livre Afiliados detectados (matt_word=${mattWord}, matt_tool=${mattTool} e forceInApp=${forceInApp}).`,
        };
      }
      if (mattWord || mattTool) {
        const paramKey = mattWord ? 'matt_word' : 'matt_tool';
        const val = (mattWord || mattTool) as string;
        return {
          storeId: 'mercadolivre',
          storeName: 'Mercado Livre',
          affiliateMode: 'query',
          affiliateParam: paramKey,
          affiliateTag: `${paramKey}=${val}&forceInApp=${forceInApp}`,
          affiliateTemplate: '{raw_url}?{id}',
          explanation: `Identificador do Mercado Livre detectado ("${paramKey}=${val}"). Dica: cole um link gerado pelo Gerador de Links (meli.la ou /social/) para incluir também o matt_tool.`,
        };
      }
    }

    // 5. Shopee Afiliados
    if (host.includes('shopee.')) {
      const afSiteId = params.get('af_siteid') || params.get('utm_source') || params.get('aff_id');
      const key = params.has('af_siteid')
        ? 'af_siteid'
        : params.has('aff_id')
          ? 'aff_id'
          : 'utm_source';
      if (afSiteId) {
        return {
          storeId: 'shopee',
          storeName: 'Shopee BR',
          affiliateMode: 'query',
          affiliateParam: key,
          affiliateTag: afSiteId,
          explanation: `ID de afiliado Shopee extraído de "${key}=${afSiteId}".`,
        };
      }
    }

    // 6. Casas Bahia / Genérico
    const genericKeys = ['utm_source', 'ref', 'aff_id', 'afiliado', 'partner_id', 'tag', 'id', 'p'];
    for (const key of genericKeys) {
      const val = params.get(key);
      if (val) {
        const isCB = host.includes('casasbahia.');
        return {
          storeId: isCB ? 'casasbahia' : null,
          storeName: isCB ? 'Casas Bahia' : host.replace(/^www\./, ''),
          affiliateMode: 'query',
          affiliateParam: key,
          affiliateTag: val,
          explanation: `Parâmetro de rastreio encontrado automaticamente: "${key}=${val}".`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Formats a WhatsApp promotional alert message using the user's template and affiliate URL.
 */
export function formatWhatsAppPromoMessage(params: {
  template: string;
  productName: string;
  storeName: string;
  oldPrice: number;
  newPrice: number;
  discountPercent: number;
  affiliateUrl: string;
}): string {
  const fmtBRL = (val: number) =>
    val.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

  return params.template
    .replace(/\{produto\}/g, params.productName)
    .replace(/\{loja\}/g, params.storeName)
    .replace(/\{preco_anterior\}/g, fmtBRL(params.oldPrice))
    .replace(/\{preco\}/g, fmtBRL(params.newPrice))
    .replace(/\{desconto\}/g, `${Math.round(params.discountPercent)}%`)
    .replace(/\{link\}/g, params.affiliateUrl);
}

/**
 * Builds a clean wa.me deep link for sending or sharing a promotional alert in WhatsApp.
 */
export function buildWhatsAppDeepLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(message);
  if (digits.length >= 10) {
    return `https://wa.me/${digits}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}
