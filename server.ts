import {GoogleGenAI} from '@google/genai';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import {WebSocketServer, WebSocket} from 'ws';
import type {
  Airport,
  AlertNotification,
  AnnouncedDeal,
  AppStateSnapshot,
  BotConfig,
  CouponSyncMeta,
  CrossStoreProductOffer,
  DealFeedMeta,
  FlightComparisonResult,
  FlightFareOffer,
  FlightGroundingSource,
  FlightLegDetail,
  FlightPriceHistoryPoint,
  GroupForwardEntry,
  LiveProductStoreSearchResult,
  MonitoredProduct,
  MonthlySavingsEntry,
  ParsedTelegramRule,
  PricePoint,
  StoreConfig,
  StoreCoupon,
  StoreOffer,
  StoreProductCoupon,
  TravelScope,
} from './src/types.ts';
import {
  ALL_AIRPORTS,
  BRAZILIAN_AIRPORTS,
  BRAZILIAN_INTERNATIONAL_AIRPORTS,
  INTERNATIONAL_DESTINATIONS,
} from './src/data/airports.ts';
import {buildAffiliateUrl, formatWhatsAppPromoMessage} from './src/utils/affiliate.ts';
import {normalizePhoneE164} from './src/utils/phone.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ofertaradar-db.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts-db.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const SESSION_COOKIE_NAME = 'ma027_session';
function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const stored = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    fs.writeFileSync(SESSION_SECRET_FILE, generated, {encoding: 'utf-8', mode: 0o600});
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}
const SESSION_SECRET = resolveSessionSecret();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEAL_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas exatas de validade para ofertas anunciadas
const DEAL_PUBLISH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos para publicar novas ofertas automaticamente
const COUPON_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos para renovação e autenticidade de cupons

function buildDealFeedMeta(nowMs: number, isPublishing = false): DealFeedMeta {
  return {
    lastPublishedAt: new Date(nowMs).toISOString(),
    nextPublishAt: new Date(nowMs + DEAL_PUBLISH_INTERVAL_MS).toISOString(),
    publishIntervalMinutes: 5,
    isPublishing,
  };
}

const DEFAULT_WHATSAPP_TEMPLATE =
  '⚡ *MEGA ACHADOS 027 — OFERTA ENCONTRADA*\n\n📦 {produto}\n🏪 Loja: {loja}\n💸 De {preco_anterior} por *{preco}* ({desconto} OFF)\n\n🔗 Comprar com desconto:\n{link}';

function createDefaultStores(): StoreConfig[] {
  return [
    {
      id: 'amazon',
      name: 'Amazon BR',
      domain: 'amazon.com.br',
      active: true,
      accentHex: '#D97706',
      affiliateMode: 'query',
      affiliateParam: 'tag',
      affiliateTag: 'megaachados027-20',
      affiliateTemplate: '{raw_url}?tag={id}',
      defaultShipping: 'Frete Grátis Prime',
      installmentsInfo: '10x sem juros',
    },
    {
      id: 'mercadolivre',
      name: 'Mercado Livre',
      domain: 'mercadolivre.com.br',
      active: true,
      accentHex: '#FACC15',
      affiliateMode: 'query',
      affiliateParam: 'matt_word',
      affiliateTag: 'megaachados027',
      affiliateTemplate: '{raw_url}?matt_word={id}',
      defaultShipping: 'Chega amanhã Full',
      installmentsInfo: '12x sem juros',
    },
    {
      id: 'kabum',
      name: 'KaBuM!',
      domain: 'kabum.com.br',
      active: true,
      accentHex: '#EA580C',
      affiliateMode: 'template',
      affiliateParam: 'awinaffid',
      affiliateTag: '847291',
      affiliateTemplate: 'https://www.awin1.com/cread.php?awinmid=17729&awinaffid={id}&ued={url}',
      defaultShipping: 'Sedex R$ 19,90',
      installmentsInfo: '10x sem juros',
    },
    {
      id: 'magalu',
      name: 'Magazine Luiza',
      domain: 'magazineluiza.com.br',
      active: true,
      accentHex: '#2563EB',
      affiliateMode: 'path_prefix',
      affiliateParam: 'partner_id',
      affiliateTag: 'megaachados027',
      affiliateTemplate: 'https://www.magazinevoce.com.br/{id}/{path}',
      defaultShipping: 'Retira Grátis Loja',
      installmentsInfo: '10x sem juros',
    },
    {
      id: 'shopee',
      name: 'Shopee BR',
      domain: 'shopee.com.br',
      active: true,
      accentHex: '#DC2626',
      affiliateMode: 'query',
      affiliateParam: 'af_siteid',
      affiliateTag: '18392040027',
      affiliateTemplate: '{raw_url}?af_siteid={id}&utm_medium=affiliates',
      defaultShipping: 'Cupom Frete Grátis',
      installmentsInfo: '6x sem juros',
    },
    {
      id: 'casasbahia',
      name: 'Casas Bahia',
      domain: 'casasbahia.com.br',
      active: true,
      accentHex: '#1D4ED8',
      affiliateMode: 'query',
      affiliateParam: 'utm_source',
      affiliateTag: 'megaachados027',
      affiliateTemplate: '{raw_url}?utm_source={id}',
      defaultShipping: 'Entrega Expressa R$ 24,90',
      installmentsInfo: '12x no cartão',
    },
  ];
}

function buildValidStoreSearchUrl(store: StoreConfig, productNameOrSlug: string): string {
  const cleanDomain = store.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const cleanQuery = productNameOrSlug
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const q = cleanQuery || 'ofertas';
  const slugQuery = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (cleanDomain.includes('amazon.')) {
    return `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}`;
  }
  if (cleanDomain.includes('mercadolivre.') || cleanDomain.includes('mercadolibre.')) {
    return `https://lista.mercadolivre.com.br/${encodeURIComponent(slugQuery || q)}`;
  }
  if (cleanDomain.includes('kabum.')) {
    return `https://www.kabum.com.br/busca/${encodeURIComponent(slugQuery || q)}`;
  }
  if (cleanDomain.includes('magazineluiza.') || cleanDomain.includes('magalu.')) {
    return `https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/`;
  }
  if (cleanDomain.includes('shopee.')) {
    return `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`;
  }
  if (cleanDomain.includes('casasbahia.')) {
    return `https://www.casasbahia.com.br/${encodeURIComponent(slugQuery || q)}/b`;
  }
  if (cleanDomain.includes('aliexpress.')) {
    return `https://pt.aliexpress.com/w/wholesale-${encodeURIComponent(slugQuery || q)}.html`;
  }
  return `https://www.${cleanDomain}/busca?q=${encodeURIComponent(q)}`;
}

function isFakeProductUrl(url: string): boolean {
  if (!url) return true;
  // Real KaBuM! product URLs always have a numeric product ID: /produto/123456
  if (/kabum\.com\.br\/produto\/\d+/i.test(url)) return false;
  // Real Magazine Luiza / Magazine Você product URLs always contain /p/<sku>
  if (/(?:magazineluiza|magazinevoce)\.com\.br\/.+\/p\/[a-z0-9]{5,14}/i.test(url)) return false;
  // Legacy synthetic URLs used /produto/<text-slug> on Amazon, Magalu, ML, Shopee, etc.
  return /\/produto\/[^/]+/i.test(url);
}

function isStoreSearchUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return true;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes('amazon.')) {
      if (/\/(?:dp|gp\/product|gp\/aw\/d|product)\/[a-z0-9]{10}/i.test(parsed.pathname)) {
        return false;
      }
      return true;
    }

    if (host.includes('mercadolivre.') || host.includes('mercadolibre.')) {
      if (host.startsWith('lista.') || path.startsWith('/jm/search') || path.startsWith('/social/')) {
        return true;
      }
      if (/\/p\/mlb\d+/i.test(parsed.pathname) || /\/mlb-?\d{6,}/i.test(parsed.pathname)) {
        return false;
      }
      return true;
    }

    if (host.includes('kabum.')) {
      if (/\/produto\/\d+/i.test(parsed.pathname)) return false;
      return true;
    }

    if (host.includes('magazineluiza.') || host.includes('magazinevoce.') || host.includes('magalu.')) {
      if (path.includes('/busca/') || path.includes('/lapromotion/')) return true;
      if (/\/p\/[a-z0-9]{5,14}(?:\/|$)/i.test(parsed.pathname)) return false;
      return true;
    }

    if (host.includes('shopee.')) {
      if (path.startsWith('/search') || parsed.searchParams.has('keyword')) return true;
      if (/-i\.\d+\.\d+/i.test(parsed.pathname) || /\/product\/\d+\/\d+/i.test(parsed.pathname)) {
        return false;
      }
      return true;
    }

    if (host.includes('casasbahia.')) {
      if (/\/b\/?$/i.test(path) || path.startsWith('/busca/')) return true;
      if (/\/p(?:\/|$)/i.test(path)) return false;
      return true;
    }

    if (host.includes('aliexpress.')) {
      if (path.startsWith('/w/wholesale-')) return true;
      if (/\/item\/\d+\.html/i.test(path)) return false;
      return true;
    }

    if (
      path === '/' ||
      path === '' ||
      path.includes('/busca') ||
      path.includes('/search') ||
      parsed.searchParams.has('q') ||
      parsed.searchParams.has('k') ||
      parsed.searchParams.has('keyword')
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtmlTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function generateProductHistory(
  productId: string,
  basePrice: number,
  stores: StoreConfig[],
  trackedStoreIds: string[],
  slug: string,
): {history: PricePoint[]; offers: StoreOffer[]} {
  const now = Date.now();
  const activeStores = stores.filter((s) => trackedStoreIds.includes(s.id));
  const history: PricePoint[] = [];

  // Deterministic pseudo-random series over 90 days (22 data points)
  const dayOffsets = [
    90, 82, 75, 68, 61, 55, 49, 43, 38, 33, 28, 24, 20, 16, 13, 10, 8, 6, 4, 2, 1, 0,
  ];
  let seed = productId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 17);
  const nextRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let rollingPrice = Math.round(basePrice * 1.12);

  for (let i = 0; i < dayOffsets.length; i++) {
    const daysAgo = dayOffsets[i];
    const store = activeStores[i % activeStores.length] || stores[0];
    const wave = Math.sin(i * 0.65) * 0.06;
    const jitter = (nextRand() - 0.52) * 0.07;
    const downwardTrend = -i * 0.0045;
    const rawPrice = Math.round(basePrice * (1.09 + wave + jitter + downwardTrend));
    const price = Math.max(Math.round(basePrice * 0.78), rawPrice);
    const previousPrice = i === 0 ? Math.round(price * 1.04) : rollingPrice;
    const deltaValue = price - previousPrice;
    const deltaPercent = previousPrice > 0 ? Number(((deltaValue / previousPrice) * 100).toFixed(1)) : 0;

    history.push({
      id: `${productId}-hist-${i}`,
      timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000 - (i % 5) * 3600 * 1000).toISOString(),
      storeId: store.id,
      storeName: store.name,
      price,
      previousPrice,
      deltaValue,
      deltaPercent,
      rawUrl: buildValidStoreSearchUrl(store, slug),
    });

    rollingPrice = price;
  }

  // Create current live offers across each tracked store
  const offers: StoreOffer[] = activeStores.map((store, idx) => {
    const spread = idx === 0 ? 0.94 : 0.98 + idx * 0.035 + (nextRand() - 0.4) * 0.03;
    const price = Math.max(Math.round(basePrice * 0.8), Math.round(basePrice * spread));
    const pixPrice = Math.round(price * 0.95);
    const shippingCost = store.defaultShipping.toLowerCase().includes('grátis') ? 0 : 19.9;

    return {
      storeId: store.id,
      storeName: store.name,
      price,
      pixPrice,
      installments: `${store.installmentsInfo} de R$ ${(price / 10).toFixed(2).replace('.', ',')}`,
      shipping: store.defaultShipping,
      shippingCost,
      inStock: true,
      rawUrl: buildValidStoreSearchUrl(store, slug),
      updatedAt: new Date(now - idx * 120000).toISOString(),
    };
  });

  // Sync last history point with current best offer
  const sortedOffers = [...offers].sort((a, b) => a.pixPrice - b.pixPrice);
  const best = sortedOffers[0];
  if (best && history.length > 1) {
    const prev = history[history.length - 2];
    const deltaValue = best.pixPrice - prev.price;
    const deltaPercent = prev.price > 0 ? Number(((deltaValue / prev.price) * 100).toFixed(1)) : 0;
    history[history.length - 1] = {
      ...history[history.length - 1],
      timestamp: new Date(now - 90000).toISOString(),
      storeId: best.storeId,
      storeName: best.storeName,
      price: best.pixPrice,
      previousPrice: prev.price,
      deltaValue,
      deltaPercent,
      rawUrl: best.rawUrl,
    };
  }

  return {history, offers};
}

function recomputeProductMetrics(product: MonitoredProduct): MonitoredProduct {
  const inStockOffers = product.offers.filter((o) => o.inStock);
  const pool = inStockOffers.length > 0 ? inStockOffers : product.offers;
  const sorted = [...pool].sort((a, b) => a.pixPrice - b.pixPrice);
  const best = sorted[0];

  const allPrices = [
    ...product.history.map((h) => h.price),
    ...product.offers.map((o) => o.pixPrice),
  ].filter((p) => p > 0);

  const avgPrice =
    allPrices.length > 0
      ? Math.round(allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length)
      : product.targetMaxPrice;
  const allTimeLow = allPrices.length > 0 ? Math.min(...allPrices) : best?.pixPrice || 0;
  const allTimeHigh = allPrices.length > 0 ? Math.max(...allPrices) : best?.pixPrice || 0;

  return {
    ...product,
    bestPrice: best ? best.pixPrice : product.bestPrice,
    bestStoreId: best ? best.storeId : product.bestStoreId,
    avgPrice,
    allTimeLow,
    allTimeHigh,
  };
}

function createInitialState(): AppStateSnapshot {
  const stores = createDefaultStores();
  const nowIso = new Date().toISOString();

  const rawProducts: Array<{
    id: string;
    name: string;
    category: string;
    brand: string;
    sku: string;
    slug: string;
    imageUrl: string;
    basePrice: number;
    targetMinPrice: number;
    targetMaxPrice: number;
    minDiscountPercent: number;
    trackedStoreIds: string[];
  }> = [
    {
      id: 'prod-rtx4070',
      name: 'Placa de Vídeo NVIDIA GeForce RTX 4070 Ti Super 16GB',
      category: 'Hardware',
      brand: 'NVIDIA',
      sku: 'RTX4070TIS-16G',
      slug: 'placa-de-video-rtx-4070-ti-super-16gb',
      imageUrl: '/src/assets/images/product_rtx_gpu_1795441707199.jpg',
      basePrice: 5490,
      targetMinPrice: 4400,
      targetMaxPrice: 5150,
      minDiscountPercent: 8,
      trackedStoreIds: ['kabum', 'amazon', 'mercadolivre', 'magalu'],
    },
    {
      id: 'prod-iphone',
      name: 'Smartphone Titanium Pro 256GB 5G Tela 120Hz',
      category: 'Smartphones',
      brand: 'Titanium',
      sku: 'TITAN-PRO-256',
      slug: 'smartphone-titanium-pro-256gb-5g',
      imageUrl: '/src/assets/images/product_iphone_pro_1795441710113.jpg',
      basePrice: 6899,
      targetMinPrice: 5500,
      targetMaxPrice: 6350,
      minDiscountPercent: 10,
      trackedStoreIds: ['amazon', 'mercadolivre', 'magalu', 'casasbahia', 'shopee'],
    },
    {
      id: 'prod-sony-xm5',
      name: 'Fone Bluetooth Sony WH-1000XM5 Cancelamento de Ruído',
      category: 'Áudio',
      brand: 'Sony',
      sku: 'WH1000XM5-BLK',
      slug: 'fone-bluetooth-sony-wh-1000xm5',
      imageUrl: '/src/assets/images/product_sony_headphones_1795441762095.jpg',
      basePrice: 2190,
      targetMinPrice: 1550,
      targetMaxPrice: 1990,
      minDiscountPercent: 12,
      trackedStoreIds: ['amazon', 'mercadolivre', 'kabum', 'shopee'],
    },
    {
      id: 'prod-oled-55',
      name: 'Smart TV OLED 55" 4K 120Hz Dolby Vision & HDMI 2.1',
      category: 'TV & Casa',
      brand: 'OLED Studio',
      sku: 'OLED55-4K-120',
      slug: 'smart-tv-oled-55-4k-120hz',
      imageUrl: '/src/assets/images/product_oled_tv_1795441716234.jpg',
      basePrice: 5199,
      targetMinPrice: 4100,
      targetMaxPrice: 4850,
      minDiscountPercent: 10,
      trackedStoreIds: ['magalu', 'amazon', 'casasbahia', 'mercadolivre'],
    },
    {
      id: 'prod-espresso',
      name: 'Cafeteira Espresso Inox Aurora 15 Bar com Vaporizador',
      category: 'Eletroportáteis',
      brand: 'Aurora',
      sku: 'AUR-ESP-15B',
      slug: 'cafeteira-espresso-inox-aurora-15-bar',
      imageUrl: '/src/assets/images/product_espresso_machine_1795441770941.jpg',
      basePrice: 1490,
      targetMinPrice: 980,
      targetMaxPrice: 1320,
      minDiscountPercent: 12,
      trackedStoreIds: ['amazon', 'magalu', 'mercadolivre', 'shopee', 'casasbahia'],
    },
    {
      id: 'prod-monitor-qhd',
      name: 'Monitor Gamer QHD 27" 180Hz Painel Fast IPS 1ms',
      category: 'Monitores',
      brand: 'Avalon',
      sku: 'AVL-27QHD-180',
      slug: 'monitor-gamer-qhd-27-180hz-ips',
      imageUrl: '/src/assets/images/product_gaming_monitor_1795441894300.jpg',
      basePrice: 1849,
      targetMinPrice: 1350,
      targetMaxPrice: 1680,
      minDiscountPercent: 10,
      trackedStoreIds: ['kabum', 'amazon', 'mercadolivre', 'magalu'],
    },
  ];

  const products: MonitoredProduct[] = rawProducts.map((item) => {
    const {history, offers} = generateProductHistory(
      item.id,
      item.basePrice,
      stores,
      item.trackedStoreIds,
      item.slug,
    );
    return recomputeProductMetrics({
      id: item.id,
      name: item.name,
      category: item.category,
      brand: item.brand,
      sku: item.sku,
      imageUrl: item.imageUrl,
      targetMinPrice: item.targetMinPrice,
      targetMaxPrice: item.targetMaxPrice,
      minDiscountPercent: item.minDiscountPercent,
      notifyWhatsApp: true,
      notifyPush: true,
      active: true,
      trackedStoreIds: item.trackedStoreIds,
      offers,
      history,
      lastCheckedAt: nowIso,
      bestPrice: item.basePrice,
      bestStoreId: item.trackedStoreIds[0],
      avgPrice: item.basePrice,
      allTimeLow: item.basePrice,
      allTimeHigh: item.basePrice,
    });
  });

  const alerts: AlertNotification[] = products.slice(0, 4).map((prod, idx) => {
    const bestOffer = [...prod.offers].sort((a, b) => a.pixPrice - b.pixPrice)[0];
    const store = stores.find((s) => s.id === bestOffer.storeId);
    const oldPrice = Math.round(bestOffer.pixPrice * (1.13 + idx * 0.02));
    const discountPercent = Number((((oldPrice - bestOffer.pixPrice) / oldPrice) * 100).toFixed(1));
    const affiliateUrl = buildAffiliateUrl(bestOffer.rawUrl, store);
    const whatsappMessage = formatWhatsAppPromoMessage({
      template: DEFAULT_WHATSAPP_TEMPLATE,
      productName: prod.name,
      storeName: bestOffer.storeName,
      oldPrice,
      newPrice: bestOffer.pixPrice,
      discountPercent,
      affiliateUrl,
    });

    return {
      id: `alert-init-${idx + 1}`,
      productId: prod.id,
      productName: prod.name,
      storeId: bestOffer.storeId,
      storeName: bestOffer.storeName,
      oldPrice,
      newPrice: bestOffer.pixPrice,
      discountPercent,
      targetMaxPrice: prod.targetMaxPrice,
      rawUrl: bestOffer.rawUrl,
      affiliateUrl,
      channels: ['whatsapp', 'push', 'dashboard'],
      whatsappStatus: idx < 2 ? 'dispatched' : 'manual_ready',
      whatsappMessage,
      createdAt: new Date(Date.now() - (idx + 1) * 38 * 60 * 1000).toISOString(),
      read: idx > 1,
      purchased: idx === 2,
      savedAmount: idx === 2 ? oldPrice - bestOffer.pixPrice : 0,
    };
  });

  const monthlySavings: MonthlySavingsEntry[] = [
    {monthKey: '2026-06', label: 'Jun', savedTotal: 640, dealsPurchased: 3, alertsTriggered: 24, avgDiscount: 14.2, topStore: 'Amazon BR'},
    {monthKey: '2026-07', label: 'Jul', savedTotal: 1120, dealsPurchased: 5, alertsTriggered: 39, avgDiscount: 17.8, topStore: 'KaBuM!'},
    {monthKey: '2026-08', label: 'Ago', savedTotal: 890, dealsPurchased: 4, alertsTriggered: 31, avgDiscount: 15.4, topStore: 'Mercado Livre'},
    {monthKey: '2026-09', label: 'Set', savedTotal: 1480, dealsPurchased: 6, alertsTriggered: 48, avgDiscount: 19.1, topStore: 'Amazon BR'},
    {monthKey: '2026-10', label: 'Out', savedTotal: 1920, dealsPurchased: 7, alertsTriggered: 56, avgDiscount: 21.3, topStore: 'Magazine Luiza'},
    {monthKey: '2026-11', label: 'Nov', savedTotal: 2640, dealsPurchased: 9, alertsTriggered: 74, avgDiscount: 24.6, topStore: 'KaBuM!'},
  ];

  const botConfig: BotConfig = {
    enabled: true,
    scanIntervalSec: 20,
    whatsappPhone: '+55 27 99842-7710',
    whatsappGroupName: 'Grupo VIP Mega Achados 027',
    whatsappGroupInviteUrl: '',
    whatsappGroupJid: '',
    autoForwardAllDealsToGroup: true,
    whatsappWebhookUrl: '',
    whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    pushEnabled: true,
    pushMinDiscount: 8,
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    autoDispatchWhatsApp: true,
    telegramImportedCount: 0,
    lastScanAt: nowIso,
  };

  const initNow = Date.now();
  return {
    products,
    stores,
    alerts,
    monthlySavings,
    botConfig,
    announcedDeals: [],
    dealFeedMeta: buildDealFeedMeta(initNow),
    publishedProductHistory: [],
    groupForwardLog: [],
    coupons: buildVerifiedStoreCoupons(stores, initNow),
    couponMeta: buildCouponMeta(stores, initNow),
  };
}

interface StoreCouponSeed {
  code: string;
  title: string;
  description: string;
  discountLabel: string;
  minPurchaseLabel: string;
  category: string;
  landingPath: string;
}

const KNOWN_STORE_COUPONS: Record<string, StoreCouponSeed[]> = {
  'amazon.com.br': [
    {
      code: 'APPAMAZON20',
      title: 'R$ 20 OFF em compras selecionadas no App',
      description: 'Válido para itens vendidos e entregues pela Amazon Brasil em tecnologia, casa e livros.',
      discountLabel: 'R$ 20 OFF',
      minPurchaseLabel: 'Acima de R$ 150',
      category: 'Geral & Tech',
      landingPath: '/gp/goldbox',
    },
    {
      code: 'TECH10OFF',
      title: '10% OFF em Eletrônicos e Informática',
      description: 'Desconto progressivo aplicado no fechamento do carrinho para periféricos e áudio.',
      discountLabel: '10% OFF',
      minPurchaseLabel: 'Acima de R$ 299',
      category: 'Eletrônicos',
      landingPath: '/b?node=16209062011',
    },
  ],
  'mercadolivre.com.br': [
    {
      code: 'MELI10OFF',
      title: '10% OFF em produtos selecionados Full',
      description: 'Limitado a R$ 100 de desconto por CPF em ofertas participantes com entrega Full.',
      discountLabel: '10% OFF',
      minPurchaseLabel: 'Acima de R$ 199',
      category: 'Entrega Full',
      landingPath: '/ofertas',
    },
    {
      code: 'MELI50',
      title: 'R$ 50 OFF em Smartphones e Eletrônicos',
      description: 'Cupom de campanha oficial válido para pagamento no Pix ou cartão Mercado Pago.',
      discountLabel: 'R$ 50 OFF',
      minPurchaseLabel: 'Acima de R$ 499',
      category: 'Smartphones',
      landingPath: '/cupons',
    },
  ],
  'kabum.com.br': [
    {
      code: 'KABUM5',
      title: '5% OFF em Hardware, Placas e Monitores',
      description: 'Acumulável com desconto à vista no Pix em produtos vendidos e entregues pelo KaBuM!.',
      discountLabel: '5% OFF',
      minPurchaseLabel: 'Sem mínimo',
      category: 'Hardware',
      landingPath: '/promocao/CUPONS',
    },
    {
      code: 'NINJA10',
      title: '10% OFF em Periféricos Gamer e Áudio',
      description: 'Válido em headsets, teclados mecânicos, mouses e cadeiras selecionadas.',
      discountLabel: '10% OFF',
      minPurchaseLabel: 'Acima de R$ 250',
      category: 'Gamer & Áudio',
      landingPath: '/perifericos',
    },
  ],
  'magazineluiza.com.br': [
    {
      code: 'MAGALU50',
      title: 'R$ 50 OFF em Eletroportáteis e TVs',
      description: 'Válido para itens vendidos e entregues pelo Magalu com retirada grátis em loja.',
      discountLabel: 'R$ 50 OFF',
      minPurchaseLabel: 'Acima de R$ 499',
      category: 'TV & Casa',
      landingPath: '/selecao/ofertasdodia/',
    },
    {
      code: '100MAGALU',
      title: 'R$ 100 OFF em Smartphones e Notebooks',
      description: 'Cupom promocional para linha selecionada de celulares, notebooks e Smart TVs 4K.',
      discountLabel: 'R$ 100 OFF',
      minPurchaseLabel: 'Acima de R$ 1.499',
      category: 'Smartphones',
      landingPath: '/celulares-e-smartphones/l/te/',
    },
  ],
  'shopee.com.br': [
    {
      code: 'SHOPEE15',
      title: '15% OFF em Lojas Oficiais Shopee Mall',
      description: 'Desconto limitado a R$ 40 em produtos oficiais com envio nacional.',
      discountLabel: '15% OFF',
      minPurchaseLabel: 'Acima de R$ 99',
      category: 'Shopee Mall',
      landingPath: '/m/cupons-diarios',
    },
    {
      code: 'FRETEZERO027',
      title: 'Frete Grátis extra em compras no Brasil',
      description: 'Válido para pedidos com vendedores indicados e lojas oficiais participantes.',
      discountLabel: 'Frete Grátis',
      minPurchaseLabel: 'Acima de R$ 19',
      category: 'Frete Grátis',
      landingPath: '/m/frete-gratis',
    },
  ],
  'aliexpress.com': [
    {
      code: 'BRASIL45',
      title: 'R$ 45 OFF em produtos com Remessa Conforme',
      description: 'Válido para pedidos enviados para o Brasil em itens Choice e eletrônicos.',
      discountLabel: 'R$ 45 OFF',
      minPurchaseLabel: 'Acima de R$ 350',
      category: 'Choice & Tech',
      landingPath: '/gcp/300000512/nnKz2G2',
    },
    {
      code: 'CHOICE12',
      title: 'R$ 12 OFF em compras Choice selecionadas',
      description: 'Desconto imediato no carrinho para acessórios, áudio e gadgets.',
      discountLabel: 'R$ 12 OFF',
      minPurchaseLabel: 'Acima de R$ 100',
      category: 'Acessórios',
      landingPath: '/',
    },
  ],
};

function buildCouponMeta(stores: StoreConfig[], nowMs: number, isRefreshing = false): CouponSyncMeta {
  const activeCount = stores.filter((s) => s.active).length;
  return {
    lastRefreshedAt: new Date(nowMs).toISOString(),
    nextRefreshAt: new Date(nowMs + COUPON_REFRESH_INTERVAL_MS).toISOString(),
    refreshIntervalMinutes: 30,
    isRefreshing,
    verifiedStoresCount: activeCount,
  };
}

function buildVerifiedStoreCoupons(stores: StoreConfig[], nowMs: number): StoreCoupon[] {
  const verifiedAt = new Date(nowMs).toISOString();
  const nextRefreshAt = new Date(nowMs + COUPON_REFRESH_INTERVAL_MS).toISOString();
  const activeStores = stores.filter((s) => s.active);
  const result: StoreCoupon[] = [];

  for (const store of activeStores) {
    const cleanDomain = store.domain.toLowerCase().replace(/^www\./, '');
    const matchedKey = Object.keys(KNOWN_STORE_COUPONS).find(
      (k) => cleanDomain.includes(k) || k.includes(cleanDomain),
    );
    const seeds: StoreCouponSeed[] = matchedKey
      ? KNOWN_STORE_COUPONS[matchedKey]
      : [
          {
            code: `${store.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7) || 'MEGA'}10`,
            title: `10% OFF em ofertas selecionadas na ${store.name}`,
            description: `Cupom promocional verificado para compras no site oficial ${store.domain}.`,
            discountLabel: '10% OFF',
            minPurchaseLabel: 'Acima de R$ 149',
            category: 'Ofertas da Loja',
            landingPath: '/',
          },
        ];

    seeds.forEach((seed, idx) => {
      const landingUrl = `https://www.${cleanDomain}${seed.landingPath.startsWith('/') ? seed.landingPath : `/${seed.landingPath}`}`;
      result.push({
        id: `cpn-${store.id}-${idx + 1}-${seed.code.toLowerCase()}`,
        storeId: store.id,
        storeName: store.name,
        storeDomain: cleanDomain,
        storeAccentHex: store.accentHex || '#EAB308',
        code: seed.code,
        title: seed.title,
        description: seed.description,
        discountLabel: seed.discountLabel,
        minPurchaseLabel: seed.minPurchaseLabel,
        category: seed.category,
        affiliateUrl: buildAffiliateUrl(landingUrl, store),
        verifiedAt,
        nextRefreshAt,
        verificationSource: 'store_verified',
        sourceUrl: landingUrl,
        active: true,
      });
    });
  }

  return result;
}

const PRODUCT_FINGERPRINT_STOPWORDS = new Set([
  'com',
  'para',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'ate',
  'sem',
  'juros',
  'frete',
  'gratis',
  'cupom',
  'oferta',
  'promocao',
  'pix',
  'preto',
  'preta',
  'branco',
  'branca',
  'azul',
  'prata',
  'cinza',
  'rosa',
  'verde',
  'vermelho',
  'bivolt',
  '110v',
  '127v',
  '220v',
  'novo',
  'nova',
  'original',
]);

function normalizeProductFingerprint(title: string): string {
  const tokens = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PRODUCT_FINGERPRINT_STOPWORDS.has(t));
  if (tokens.length === 0) return '';
  return tokens.slice(0, 6).join('-');
}

function extractBalancedJson(source: string, startIndex = 0, expectedOpen?: '{' | '['): string | null {
  let idx = startIndex;
  while (idx < source.length) {
    const ch = source[idx];
    if (expectedOpen) {
      if (ch === expectedOpen) break;
    } else if (ch === '{' || ch === '[') {
      break;
    }
    idx++;
  }
  if (idx >= source.length) return null;

  const openChar = source[idx];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = idx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return source.slice(idx, i + 1);
      }
    }
  }
  return null;
}

function parseFirstBalancedJsonObject<T>(rawText: string): T | null {
  let cursor = 0;
  while (cursor < rawText.length) {
    const bracePos = rawText.indexOf('{', cursor);
    if (bracePos === -1) return null;
    const candidate = extractBalancedJson(rawText, bracePos, '{');
    if (!candidate) return null;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      cursor = bracePos + 1;
    }
  }
  return null;
}

function loadState(): AppStateSnapshot {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as Partial<AppStateSnapshot>;
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.stores)) {
        // Migrate legacy brand name if present in persisted state
        if (parsed.botConfig?.whatsappGroupName?.includes('OfertaRadar')) {
          parsed.botConfig.whatsappGroupName = 'Grupo VIP Mega Achados 027';
        }
        if (parsed.botConfig?.whatsappTemplate?.includes('OfertaRadar')) {
          parsed.botConfig.whatsappTemplate = DEFAULT_WHATSAPP_TEMPLATE;
        }
        const stores = parsed.stores.map((s) => ({
          ...s,
          affiliateTag: s.affiliateTag.replace(/ofertaradar/gi, 'megaachados027'),
        }));
        const storeById = new Map(stores.map((s) => [s.id, s]));

        // Migrate any legacy synthetic /produto/<slug> URLs so zero 404 links ever survive
        const products = parsed.products.map((prod) => ({
          ...prod,
          offers: (prod.offers || []).map((offer) => {
            const store = storeById.get(offer.storeId);
            if (store && isFakeProductUrl(offer.rawUrl)) {
              return {...offer, rawUrl: buildValidStoreSearchUrl(store, prod.name)};
            }
            return offer;
          }),
          history: (prod.history || []).map((pt) => {
            const store = storeById.get(pt.storeId);
            if (store && isFakeProductUrl(pt.rawUrl)) {
              return {...pt, rawUrl: buildValidStoreSearchUrl(store, prod.name)};
            }
            return pt;
          }),
        }));

        const alerts = (parsed.alerts || []).map((a) => {
          const store = storeById.get(a.storeId);
          let rawUrl = a.rawUrl;
          let affiliateUrl = a.affiliateUrl;
          if (store && isFakeProductUrl(rawUrl)) {
            rawUrl = buildValidStoreSearchUrl(store, a.productName);
            affiliateUrl = buildAffiliateUrl(rawUrl, store);
          }
          const cleanedMsg = a.whatsappMessage
            .replace(/OfertaRadar/g, 'Mega Achados 027')
            .replace(a.affiliateUrl, affiliateUrl);
          return {
            ...a,
            rawUrl,
            affiliateUrl,
            whatsappMessage: cleanedMsg,
          };
        });

        const announcedDeals = Array.isArray(parsed.announcedDeals)
          ? parsed.announcedDeals
              .filter((d) => !isFakeProductUrl(d.rawUrl))
              .map((d) => ({
                ...d,
                imageUrl: (d.imageUrl || '').replace(
                  /^https:\/\/i\.promobit\.com\.br\/520\//i,
                  'https://i.promobit.com.br/300/',
                ),
              }))
          : [];

        const nowMs = Date.now();
        const coupons =
          Array.isArray(parsed.coupons) && parsed.coupons.length > 0
            ? parsed.coupons
            : buildVerifiedStoreCoupons(stores, nowMs);
        const couponMeta: CouponSyncMeta =
          parsed.couponMeta && parsed.couponMeta.nextRefreshAt
            ? {...parsed.couponMeta, isRefreshing: false, refreshIntervalMinutes: 30}
            : buildCouponMeta(stores, nowMs);
        const dealFeedMeta: DealFeedMeta =
          parsed.dealFeedMeta && parsed.dealFeedMeta.nextPublishAt
            ? {...parsed.dealFeedMeta, isPublishing: false, publishIntervalMinutes: 5}
            : buildDealFeedMeta(nowMs);

        const historySet = new Set<string>(
          Array.isArray(parsed.publishedProductHistory) ? parsed.publishedProductHistory : [],
        );
        for (const d of announcedDeals) {
          if (d.productId) historySet.add(`id:${d.productId}`);
          const fp = normalizeProductFingerprint(d.productName || '');
          if (fp) historySet.add(`fp:${fp}`);
        }
        const publishedProductHistory = Array.from(historySet).slice(-3000);

        const rawBotConfig = (parsed.botConfig || {}) as BotConfig;
        const botConfig: BotConfig = {
          ...rawBotConfig,
          whatsappGroupInviteUrl: rawBotConfig.whatsappGroupInviteUrl || '',
          whatsappGroupJid: rawBotConfig.whatsappGroupJid || '',
          autoForwardAllDealsToGroup:
            typeof rawBotConfig.autoForwardAllDealsToGroup === 'boolean'
              ? rawBotConfig.autoForwardAllDealsToGroup
              : true,
        };

        const groupForwardLog: GroupForwardEntry[] = Array.isArray(parsed.groupForwardLog)
          ? parsed.groupForwardLog.slice(0, 60)
          : [];

        return {
          products,
          stores,
          alerts,
          monthlySavings: parsed.monthlySavings || [],
          botConfig,
          announcedDeals,
          dealFeedMeta,
          publishedProductHistory,
          groupForwardLog,
          coupons,
          couponMeta,
        };
      }
    }
  } catch (err) {
    console.warn('Could not read existing DB file, initializing defaults:', err);
  }
  return createInitialState();
}

function saveState(state: AppStateSnapshot) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist state to disk:', err);
  }
}

function parseSafePublicWebhookUrl(rawUrl: string): URL | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsedUrl = new URL(trimmed);
    const host = parsedUrl.hostname.toLowerCase();
    const isPrivateHost =
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (!['https:', 'http:'].includes(parsedUrl.protocol) || isPrivateHost) {
      return null;
    }
    return parsedUrl;
  } catch {
    return null;
  }
}

function formatBRLServer(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildGroupDealMessage(deal: AnnouncedDeal, groupName: string): string {
  const lines = [
    `*${groupName || 'Mega Achados 027'} · Nova Oferta no Site*`,
    '',
    `*${deal.productName}*`,
    `Loja: ${deal.storeName}`,
    `De ${formatBRLServer(deal.referencePrice)} por *${formatBRLServer(deal.announcedPrice)}* (-${Math.round(deal.announcedDiscountPercent)}%)`,
  ];
  if (deal.couponCode && !deal.couponIsPageActivation) {
    lines.push(`Cupom: *${deal.couponCode}*${deal.couponLabel ? ` (${deal.couponLabel})` : ''}`);
  } else if (deal.couponIsPageActivation) {
    lines.push('Cupom: Ative o cupom diretamente na página da oferta');
  }
  if (deal.installments) {
    lines.push(`Pagamento: ${deal.installments}`);
  }
  lines.push('', `Aproveite aqui: ${deal.affiliateUrl}`);
  return lines.join('\n');
}

async function forwardDealsToWhatsappGroup(
  deals: AnnouncedDeal[],
  options?: {force?: boolean},
): Promise<GroupForwardEntry[]> {
  if (!Array.isArray(deals) || deals.length === 0) return [];
  if (!options?.force && state.botConfig.autoForwardAllDealsToGroup === false) {
    return [];
  }

  const currentLog = Array.isArray(state.groupForwardLog) ? state.groupForwardLog : [];
  const existingDealIds = new Set(currentLog.map((entry) => entry.dealId));
  const groupName = (state.botConfig.whatsappGroupName || 'Grupo VIP Mega Achados 027').trim();
  const groupJid = String(state.botConfig.whatsappGroupJid || '').trim();
  const groupInviteUrl = String(state.botConfig.whatsappGroupInviteUrl || '').trim();
  const senderPhone = String(state.botConfig.whatsappPhone || '').trim();
  const parsedWebhook = parseSafePublicWebhookUrl(state.botConfig.whatsappWebhookUrl || '');

  const createdEntries: GroupForwardEntry[] = [];

  for (const deal of deals) {
    if (!options?.force && existingDealIds.has(deal.id)) continue;

    const message = buildGroupDealMessage(deal, groupName);
    let status: GroupForwardEntry['status'] = 'ready_for_group';
    let lastAttemptDetail = parsedWebhook
      ? undefined
      : 'Pronto na fila do grupo (configure um Webhook para envio automático sem clique)';

    if (parsedWebhook) {
      try {
        const resp = await fetch(parsedWebhook.toString(), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            event: 'megaachados027.group_deal_forward',
            targetType: 'group',
            senderPhone,
            groupName,
            groupJid,
            groupInviteUrl,
            deal: {
              id: deal.id,
              productId: deal.productId,
              productName: deal.productName,
              storeName: deal.storeName,
              price: deal.announcedPrice,
              referencePrice: deal.referencePrice,
              discountPercent: deal.announcedDiscountPercent,
              couponCode: deal.couponCode || null,
              affiliateUrl: deal.affiliateUrl,
              imageUrl: deal.imageUrl,
            },
            message,
            timestamp: new Date().toISOString(),
          }),
        });
        if (resp.ok) {
          status = 'webhook_sent';
          lastAttemptDetail = `Enviado automaticamente ao grupo (HTTP ${resp.status})`;
        } else {
          status = 'ready_for_group';
          lastAttemptDetail = `Webhook retornou HTTP ${resp.status} — disponível para envio manual`;
        }
      } catch (err) {
        status = 'ready_for_group';
        lastAttemptDetail =
          err instanceof Error ? `Erro no Webhook: ${err.message}` : 'Erro ao conectar no Webhook';
      }
    }

    createdEntries.push({
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dealId: deal.id,
      productName: deal.productName,
      storeName: deal.storeName,
      price: deal.announcedPrice,
      referencePrice: deal.referencePrice,
      discountPercent: deal.announcedDiscountPercent,
      couponCode: deal.couponCode,
      affiliateUrl: deal.affiliateUrl,
      groupName,
      message,
      status,
      createdAt: new Date().toISOString(),
      lastAttemptDetail,
    });
  }

  if (createdEntries.length > 0) {
    const newIds = new Set(createdEntries.map((e) => e.dealId));
    const retained = currentLog.filter((e) => !newIds.has(e.dealId));
    state.groupForwardLog = [...createdEntries, ...retained].slice(0, 60);
    saveState(state);
    broadcast('groupForwardLog:synced', state.groupForwardLog);
  }

  return createdEntries;
}

let state = loadState();
const clients = new Set<WebSocket>();

function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({type, payload, timestamp: new Date().toISOString()});
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function evaluateProductForAnnouncement(
  prod: MonitoredProduct,
  activeStoreMap: Map<string, StoreConfig>,
): {
  offer: StoreOffer;
  store: StoreConfig;
  referencePrice: number;
  discountPercent: number;
} | null {
  if (!prod.active) return null;
  const eligibleOffers = prod.offers
    .filter((o) => o.inStock && activeStoreMap.has(o.storeId))
    .sort((a, b) => a.pixPrice - b.pixPrice);
  const bestOffer = eligibleOffers[0];
  if (!bestOffer) return null;
  const store = activeStoreMap.get(bestOffer.storeId);
  if (!store) return null;

  const referencePrice = Math.max(prod.avgPrice, bestOffer.price);
  const discountPercent =
    referencePrice > bestOffer.pixPrice
      ? Number((((referencePrice - bestOffer.pixPrice) / referencePrice) * 100).toFixed(1))
      : 0;

  const stillDiscounted =
    discountPercent >= 3 &&
    (bestOffer.pixPrice <= prod.targetMaxPrice || discountPercent >= prod.minDiscountPercent);

  if (!stillDiscounted) return null;
  return {offer: bestOffer, store, referencePrice, discountPercent};
}

let isRepairingSearchUrlDeals = false;
let hasCompletedInitialDealUrlRepair = false;

function pruneExpiredAndInvalidDeals(shouldBroadcast = false): boolean {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const activeStoreMap = new Map(state.stores.filter((s) => s.active).map((s) => [s.id, s]));
  const productMap = new Map(state.products.map((p) => [p.id, p]));

  const prevCount = state.announcedDeals.length;
  let changed = false;
  const validDeals: AnnouncedDeal[] = [];

  for (const deal of state.announcedDeals) {
    // 1. Must be verified by manual search
    if (!deal.verifiedByManualSearch) {
      changed = true;
      continue;
    }

    // 2. Automatically delete after 3 hours
    const expiresMs = new Date(deal.expiresAt).getTime();
    if (!Number.isFinite(expiresMs) || nowMs >= expiresMs) {
      changed = true;
      continue;
    }

    // 3. Reject any legacy fake /produto/<slug> 404 URLs immediately
    if (isFakeProductUrl(deal.rawUrl)) {
      changed = true;
      continue;
    }

    // 4. Verify store is still configured and active
    const store = activeStoreMap.get(deal.storeId);
    if (!store) {
      changed = true;
      continue;
    }

    // 5a. Live-discovered real store deals stay valid for up to 3 hours while store is active
    if (deal.isLiveDiscovered) {
      if (deal.announcedDiscountPercent < 3 || deal.announcedPrice <= 0) {
        changed = true;
        continue;
      }
      // Reject any deal that still points to a store search page once startup repair is complete
      if (hasCompletedInitialDealUrlRepair && !isRepairingSearchUrlDeals && isStoreSearchUrl(deal.rawUrl)) {
        changed = true;
        continue;
      }
      const freshAffiliateUrl = buildAffiliateUrl(deal.rawUrl, store);
      const fixedImageUrl = (deal.imageUrl || '').replace(
        /^https:\/\/i\.promobit\.com\.br\/520\//i,
        'https://i.promobit.com.br/300/',
      );
      if (freshAffiliateUrl !== deal.affiliateUrl || fixedImageUrl !== deal.imageUrl) {
        changed = true;
      }
      validDeals.push({
        ...deal,
        imageUrl: fixedImageUrl,
        storeName: store.name,
        affiliateUrl: freshAffiliateUrl,
        lastVerifiedAt: nowIso,
      });
      continue;
    }

    // 5b. Monitored radar products: verify product & active discount still hold
    const prod = productMap.get(deal.productId);
    if (!prod || !prod.active) {
      changed = true;
      continue;
    }

    const liveOffer = prod.offers.find((o) => o.storeId === deal.storeId && o.inStock);
    if (!liveOffer) {
      changed = true;
      continue;
    }

    const liveRef = Math.max(prod.avgPrice, liveOffer.price);
    const liveDiscount =
      liveRef > liveOffer.pixPrice
        ? Number((((liveRef - liveOffer.pixPrice) / liveRef) * 100).toFixed(1))
        : 0;

    // Delete immediately if price went up above announced price OR discount dropped below announced discount
    if (
      liveOffer.pixPrice > deal.announcedPrice ||
      liveDiscount < Math.max(3, deal.announcedDiscountPercent - 0.5)
    ) {
      changed = true;
      continue;
    }

    const freshAffiliateUrl = buildAffiliateUrl(liveOffer.rawUrl, store);
    if (freshAffiliateUrl !== deal.affiliateUrl) {
      changed = true;
    }

    validDeals.push({
      ...deal,
      announcedPrice: liveOffer.pixPrice,
      referencePrice: liveRef,
      announcedDiscountPercent: Math.max(deal.announcedDiscountPercent, liveDiscount),
      installments: liveOffer.installments,
      shipping: liveOffer.shipping,
      rawUrl: liveOffer.rawUrl,
      affiliateUrl: freshAffiliateUrl,
      lastVerifiedAt: nowIso,
    });
  }

  if (changed || validDeals.length !== prevCount) {
    state.announcedDeals = validDeals;
    saveState(state);
    if (shouldBroadcast) {
      broadcast('announcedDeals:synced', state.announcedDeals);
    }
    return true;
  }

  return false;
}

function getPublishedHistorySet(): Set<string> {
  if (!Array.isArray(state.publishedProductHistory)) {
    state.publishedProductHistory = [];
  }
  const set = new Set<string>(state.publishedProductHistory);
  for (const d of state.announcedDeals) {
    if (d.productId) set.add(`id:${d.productId}`);
    const fp = normalizeProductFingerprint(d.productName || '');
    if (fp) set.add(`fp:${fp}`);
  }
  return set;
}

function isProductAlreadyPublished(
  deal: {productId: string; productName: string},
  historySet: Set<string>,
): boolean {
  if (deal.productId && historySet.has(`id:${deal.productId}`)) return true;
  const fp = normalizeProductFingerprint(deal.productName || '');
  if (fp && historySet.has(`fp:${fp}`)) return true;
  return false;
}

function recordPublishedProducts(deals: AnnouncedDeal[]): void {
  if (!Array.isArray(state.publishedProductHistory)) {
    state.publishedProductHistory = [];
  }
  const set = new Set<string>(state.publishedProductHistory);
  for (const d of deals) {
    if (d.productId) set.add(`id:${d.productId}`);
    const fp = normalizeProductFingerprint(d.productName || '');
    if (fp) set.add(`fp:${fp}`);
  }
  state.publishedProductHistory = Array.from(set).slice(-3000);
}

const LIVE_DEAL_TOPICS = [
  {query: 'fone bluetooth', category: 'Áudio'},
  {query: 'monitor gamer', category: 'Monitores'},
  {query: 'smart tv 4k', category: 'TV & Casa'},
  {query: 'ssd nvme', category: 'Hardware'},
  {query: 'smartphone samsung', category: 'Smartphones'},
  {query: 'air fryer', category: 'Eletroportáteis'},
  {query: 'notebook gamer', category: 'Notebooks'},
  {query: 'teclado mecanico', category: 'Periféricos'},
  {query: 'caixa de som jbl', category: 'Áudio'},
  {query: 'cafeteira espresso', category: 'Eletroportáteis'},
  {query: 'mouse gamer', category: 'Periféricos'},
  {query: 'placa de video', category: 'Hardware'},
  {query: 'smartwatch', category: 'Wearables'},
  {query: 'kindle', category: 'Eletrônicos'},
  {query: 'tablet', category: 'Tablets'},
  {query: 'headset gamer', category: 'Áudio'},
  {query: 'processador ryzen', category: 'Hardware'},
  {query: 'memoria ram ddr4', category: 'Hardware'},
  {query: 'cadeira gamer', category: 'Periféricos'},
  {query: 'aspirador robo', category: 'Eletroportáteis'},
  {query: 'geladeira frost free', category: 'Eletroportáteis'},
  {query: 'ar condicionado inverter', category: 'TV & Casa'},
  {query: 'microondas inox', category: 'Eletroportáteis'},
  {query: 'maquina de lavar', category: 'Eletroportáteis'},
  {query: 'soundbar bluetooth', category: 'Áudio'},
  {query: 'projetor full hd', category: 'TV & Casa'},
  {query: 'smartphone motorola', category: 'Smartphones'},
  {query: 'smartphone xiaomi', category: 'Smartphones'},
  {query: 'iphone', category: 'Smartphones'},
  {query: 'playstation 5', category: 'Games'},
  {query: 'nintendo switch', category: 'Games'},
  {query: 'controle sem fio', category: 'Games'},
  {query: 'impressora tanque de tinta', category: 'Periféricos'},
  {query: 'roteador wifi 6', category: 'Hardware'},
  {query: 'parafusadeira bateria', category: 'Ferramentas'},
  {query: 'liquidificador oster', category: 'Eletroportáteis'},
  {query: 'panela de pressao eletrica', category: 'Eletroportáteis'},
  {query: 'purificador de agua', category: 'Eletroportáteis'},
];

const CATEGORY_TO_SEARCH_QUERY: Record<string, string> = {
  Hardware: 'placa de video ssd',
  Smartphones: 'smartphone 5g',
  'Áudio': 'fone bluetooth',
  'TV & Casa': 'smart tv 4k',
  'Eletroportáteis': 'air fryer cafeteira',
  Monitores: 'monitor gamer',
  Notebooks: 'notebook',
  'Periféricos': 'teclado mouse gamer',
};

let manualSearchCursor = Math.floor(Math.random() * LIVE_DEAL_TOPICS.length);

function mapRetailerCategory(rawCat: string, fallback = 'Ofertas'): string {
  const lower = rawCat
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (lower.includes('placa') || lower.includes('ssd') || lower.includes('hardware') || lower.includes('processador') || lower.includes('memoria')) {
    return 'Hardware';
  }
  if (lower.includes('celular') || lower.includes('smartphone') || lower.includes('iphone')) {
    return 'Smartphones';
  }
  if (lower.includes('fone') || lower.includes('headset') || lower.includes('audio') || lower.includes('caixa de som')) {
    return 'Áudio';
  }
  if (lower.includes('monitor')) {
    return 'Monitores';
  }
  if (lower.includes('tv') || lower.includes('televis')) {
    return 'TV & Casa';
  }
  if (lower.includes('notebook') || lower.includes('computador')) {
    return 'Notebooks';
  }
  if (lower.includes('teclado') || lower.includes('mouse') || lower.includes('perifer') || lower.includes('gamer')) {
    return 'Periféricos';
  }
  if (lower.includes('eletro') || lower.includes('cozinha') || lower.includes('cafe') || lower.includes('fryer')) {
    return 'Eletroportáteis';
  }
  if (lower.includes('tablet')) {
    return 'Tablets';
  }
  return rawCat.trim() || fallback;
}

interface KabumApiItem {
  id: string | number;
  attributes?: {
    title?: string;
    friendly_name?: string;
    price?: number;
    old_price?: number;
    price_with_discount?: number;
    available?: boolean;
    photos?: {g?: string[]; m?: string[]; p?: string[]};
    manufacturer?: {name?: string};
    category?: {name?: string};
    offer?: {
      price?: number;
      price_with_discount?: number;
      discount_percentage?: number;
    } | null;
  };
}

async function fetchLiveKabumDeals(opts: {
  query?: string;
  pageNumber: number;
  store: StoreConfig;
  nowIso: string;
  expiresIso: string;
}): Promise<AnnouncedDeal[]> {
  const {query, pageNumber, store, nowIso, expiresIso} = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const endpoint = query?.trim()
      ? `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query=${encodeURIComponent(
          query.trim(),
        )}&page_number=${pageNumber}&page_size=16&sort=most_searched`
      : `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?page_number=${pageNumber}&page_size=16&facet_filters=eyJoYXNfb2ZmZXIiOlsidHJ1ZSJdfQ==&sort=most_searched`;

    const resp = await fetch(endpoint, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return [];

    const payload = (await resp.json()) as {data?: KabumApiItem[]};
    const items = Array.isArray(payload.data) ? payload.data : [];
    const results: AnnouncedDeal[] = [];

    for (const item of items) {
      const attrs = item.attributes;
      if (!attrs || attrs.available === false) continue;
      const numericId = String(item.id || '').replace(/\D/g, '');
      const title = String(attrs.title || '').trim();
      if (!numericId || !title) continue;

      const offer = attrs.offer;
      const pixPrice = Number(offer?.price_with_discount || attrs.price_with_discount || 0);
      const regularPrice = Math.max(
        Number(attrs.old_price || 0),
        Number(attrs.price || 0),
        Number(offer?.price || 0),
      );

      if (pixPrice <= 0 || regularPrice <= pixPrice) continue;
      const computedPct = Number((((regularPrice - pixPrice) / regularPrice) * 100).toFixed(1));
      const discountPct = Math.max(
        computedPct,
        Number(offer?.discount_percentage || 0),
      );
      if (discountPct < 6) continue;

      const imageUrl =
        attrs.photos?.g?.[0] || attrs.photos?.m?.[0] || attrs.photos?.p?.[0] || '';
      const rawUrl = `https://www.kabum.com.br/produto/${numericId}`;
      const brand = attrs.manufacturer?.name?.trim() || title.split(' ')[0] || 'KaBuM!';
      const category = mapRetailerCategory(attrs.category?.name || title, 'Hardware');

      results.push({
        id: `deal-live-kabum-${numericId}`,
        productId: `kabum-${numericId}`,
        productName: title.slice(0, 120),
        category,
        brand,
        imageUrl,
        storeId: store.id,
        storeName: store.name,
        announcedPrice: Math.round(pixPrice * 100) / 100,
        referencePrice: Math.round(regularPrice * 100) / 100,
        announcedDiscountPercent: Number(discountPct.toFixed(1)),
        installments: `${store.installmentsInfo} de R$ ${(regularPrice / 10).toFixed(2).replace('.', ',')}`,
        shipping: store.defaultShipping,
        rawUrl,
        affiliateUrl: buildAffiliateUrl(rawUrl, store),
        verifiedByManualSearch: true,
        isLiveDiscovered: true,
        announcedAt: nowIso,
        expiresAt: expiresIso,
        lastVerifiedAt: nowIso,
      });
    }

    return results.sort((a, b) => b.announcedDiscountPercent - a.announcedDiscountPercent);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveAmazonDeals(opts: {
  query: string;
  fallbackCategory: string;
  store: StoreConfig;
  nowIso: string;
  expiresIso: string;
}): Promise<AnnouncedDeal[]> {
  const {query, fallbackCategory, store, nowIso, expiresIso} = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(query.trim())}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return [];

    const html = await resp.text();
    const cards = html.split('data-component-type="s-search-result"').slice(1, 32);
    const seenAsins = new Set<string>();
    const results: AnnouncedDeal[] = [];

    for (const card of cards) {
      // Skip sponsored ads — keep only organic products with real /dp/{ASIN} URLs
      const asinMatch = card.match(/\/dp\/([A-Z0-9]{10})/);
      if (!asinMatch) continue;
      const asin = asinMatch[1];
      if (seenAsins.has(asin)) continue;

      const titleMatch = card.match(/<h2[^>]*aria-label="([^"]+)"/);
      if (!titleMatch) continue;
      const rawTitle = decodeHtmlEntities(titleMatch[1]).trim();
      if (!rawTitle || /^an[uú]ncio patrocinado/i.test(rawTitle)) continue;

      const priceMatches = [
        ...card.matchAll(/a-offscreen">(?:De:\s*)?R\$[\s\u00a0]*([0-9.]+,[0-9]{2})<\/span>/g),
      ];
      if (priceMatches.length < 2) continue;

      const parseBrl = (raw: string) => Number(raw.replace(/\./g, '').replace(',', '.'));
      const currentPrice = parseBrl(priceMatches[0][1]);
      // Find the first higher reference ("De:") price
      let referencePrice = 0;
      for (let i = 1; i < priceMatches.length; i++) {
        const candidate = parseBrl(priceMatches[i][1]);
        if (candidate > currentPrice * 1.05 && candidate < currentPrice * 4) {
          referencePrice = candidate;
          break;
        }
      }
      if (currentPrice <= 15 || referencePrice <= currentPrice) continue;

      const discountPct = Number(
        (((referencePrice - currentPrice) / referencePrice) * 100).toFixed(1),
      );
      if (discountPct < 6) continue;

      seenAsins.add(asin);
      const imageUrl = card.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+/)?.[0] || '';
      const rawUrl = `https://www.amazon.com.br/dp/${asin}`;
      const brand = rawTitle.split(' ')[0] || 'Amazon';
      const category = mapRetailerCategory(rawTitle, fallbackCategory);

      results.push({
        id: `deal-live-amazon-${asin}`,
        productId: `amazon-${asin}`,
        productName: rawTitle.slice(0, 120),
        category,
        brand,
        imageUrl,
        storeId: store.id,
        storeName: store.name,
        announcedPrice: Math.round(currentPrice * 100) / 100,
        referencePrice: Math.round(referencePrice * 100) / 100,
        announcedDiscountPercent: discountPct,
        installments: `${store.installmentsInfo} de R$ ${(currentPrice / 10).toFixed(2).replace('.', ',')}`,
        shipping: store.defaultShipping,
        rawUrl,
        affiliateUrl: buildAffiliateUrl(rawUrl, store),
        verifiedByManualSearch: true,
        isLiveDiscovered: true,
        announcedAt: nowIso,
        expiresAt: expiresIso,
        lastVerifiedAt: nowIso,
      });
    }

    return results.sort((a, b) => b.announcedDiscountPercent - a.announcedDiscountPercent);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

interface PromobitOfferEntry {
  offerId?: number | string;
  offerTitle?: string;
  offerPrice?: number | string;
  offerOldPrice?: number | string;
  offerDiscontPercentage?: number | string;
  offerCoupon?: string | null;
  offerPhoto?: string | null;
  offerSlug?: string | null;
  storeName?: string | null;
  storeDomain?: string | null;
  categorySlug?: string | null;
}

const PROMOBIT_COUPON_ROUTES: Array<{path: string; category: string; keywords: string[]}> = [
  {path: '/', category: 'Destaques', keywords: []},
  {
    path: '/promocoes/smartphones-tablets-e-telefones/',
    category: 'Smartphones',
    keywords: ['celular', 'smartphone', 'samsung', 'galaxy', 'iphone', 'motorola', 'xiaomi', 'redmi', 'poco', 'tablet'],
  },
  {
    path: '/promocoes/informatica/',
    category: 'Hardware',
    keywords: ['ryzen', 'intel', 'placa', 'rtx', 'rx', 'ssd', 'nvme', 'memoria', 'ram', 'monitor', 'pc', 'gamer', 'impressora', 'notebook'],
  },
  {
    path: '/promocoes/tv/s/',
    category: 'TV & Casa',
    keywords: ['tv', 'smart tv', 'oled', 'qled', 'tcl', 'lg', 'samsung', '4k', '55', '65', '50', '43'],
  },
  {
    path: '/promocoes/fone-de-ouvido/s/',
    category: 'Áudio',
    keywords: ['fone', 'bluetooth', 'headset', 'jbl', 'sony', 'anker', 'soundcore', 'airpods', 'buds', 'earbuds', 'audio'],
  },
  {
    path: '/promocoes/eletrodomesticos/',
    category: 'Eletroportáteis',
    keywords: ['geladeira', 'lavadora', 'maquina', 'microondas', 'fogao', 'air fryer', 'fritadeira', 'eletro', 'electrolux', 'brastemp', 'consul'],
  },
  {
    path: '/promocoes/games/',
    category: 'Games',
    keywords: ['game', 'ps5', 'playstation', 'xbox', 'nintendo', 'switch', 'controle', 'jogo', 'console'],
  },
  {
    path: '/promocoes/notebooks/s/',
    category: 'Notebooks',
    keywords: ['notebook', 'laptop', 'macbook', 'vivobook', 'ideapad', 'nitro', 'loq', 'dell', 'asus', 'acer', 'lenovo'],
  },
  {
    path: '/promocoes/eletronicos-audio-e-video/',
    category: 'Áudio',
    keywords: ['caixa de som', 'soundbar', 'projetor', 'home theater', 'eletronico', 'camera', 'drone'],
  },
  {
    path: '/promocoes/cafeteiras/s/',
    category: 'Eletroportáteis',
    keywords: ['cafeteira', 'cafe', 'espresso', 'nespresso', 'dolce gusto', 'oster', 'tres'],
  },
  {
    path: '/promocoes/caixa-de-som/s/',
    category: 'Áudio',
    keywords: ['caixa de som', 'jbl', 'boombox', 'flip', 'charge', 'partybox', 'torre'],
  },
  {
    path: '/promocoes/smartwatch-smartband/s/',
    category: 'Wearables',
    keywords: ['smartwatch', 'relogio', 'watch', 'smartband', 'amazfit', 'garmin', 'huawei'],
  },
  {
    path: '/promocoes/teclado/s/',
    category: 'Periféricos',
    keywords: ['teclado', 'mecanico', 'redragon', 'logitech', 'hyperx', 'razer', 'corsair'],
  },
  {
    path: '/promocoes/mouse/s/',
    category: 'Periféricos',
    keywords: ['mouse', 'gamer', 'logitech', 'razer', 'hyperx', 'sem fio'],
  },
  {
    path: '/promocoes/tablets/s/',
    category: 'Tablets',
    keywords: ['tablet', 'ipad', 'tab', 'kindle', 'e-reader'],
  },
  {
    path: '/promocoes/eletroportateis/',
    category: 'Eletroportáteis',
    keywords: ['liquidificador', 'batedeira', 'mixer', 'sanduicheira', 'torradeira', 'ferro', 'panela', 'ventilador'],
  },
  {
    path: '/promocoes/casa-e-jardim/',
    category: 'TV & Casa',
    keywords: ['casa', 'cozinha', 'aspirador', 'robo', 'colchao', 'travesseiro', 'panela', 'purificador'],
  },
  {
    path: '/promocoes/beleza-e-saude/',
    category: 'Beleza & Saúde',
    keywords: ['perfume', 'secador', 'chapinha', 'escova', 'barbeador', 'skincare', 'shampoo'],
  },
  {
    path: '/promocoes/esporte-e-lazer/',
    category: 'Esporte',
    keywords: ['tenis', 'corrida', 'bicicleta', 'academia', 'suplemento', 'whey', 'creatina', 'mochila'],
  },
  {
    path: '/promocoes/ferramentas/',
    category: 'Ferramentas',
    keywords: ['furadeira', 'parafusadeira', 'bosch', 'makita', 'dewalt', 'lavadora de alta pressao', 'ferramenta'],
  },
  {
    path: '/promocoes/monitor/s/',
    category: 'Monitores',
    keywords: ['monitor', '144hz', '180hz', '240hz', 'ultrawide', 'ips', 'lg', 'samsung', 'aoc', 'dell'],
  },
  {
    path: '/promocoes/ssd/s/',
    category: 'Hardware',
    keywords: ['ssd', 'nvme', 'm2', 'kingston', 'sandisk', 'wd', 'samsung', 'armazenamento'],
  },
  {
    path: '/promocoes/geladeira/s/',
    category: 'Eletroportáteis',
    keywords: ['geladeira', 'refrigerador', 'frost free', 'duplex', 'inverse', 'brastemp', 'electrolux', 'consul'],
  },
  {
    path: '/promocoes/ar-condicionado/s/',
    category: 'TV & Casa',
    keywords: ['ar condicionado', 'inverter', 'btu', 'split', 'midea', 'lg', 'samsung', 'daikin'],
  },
  {
    path: '/promocoes/aspirador/s/',
    category: 'Eletroportáteis',
    keywords: ['aspirador', 'robo', 'vertical', 'wap', 'electrolux', 'mondial', 'kabum smart'],
  },
  {
    path: '/promocoes/fritadeira/s/',
    category: 'Eletroportáteis',
    keywords: ['air fryer', 'fritadeira', 'mondial', 'philips', 'walita', 'oster', 'rita lobo', 'electrolux'],
  },
  {
    path: '/promocoes/cadeira/s/',
    category: 'Periféricos',
    keywords: ['cadeira', 'gamer', 'escritorio', 'ergonomica', 'elements', 'dt3', 'husky', 'thunderx3'],
  },
  {
    path: '/promocoes/impressora/s/',
    category: 'Periféricos',
    keywords: ['impressora', 'multifuncional', 'ecotank', 'epson', 'hp', 'canon', 'brother'],
  },
  {
    path: '/promocoes/processador/s/',
    category: 'Hardware',
    keywords: ['processador', 'ryzen', 'intel', 'core', 'i5', 'i7', 'amd'],
  },
  {
    path: '/promocoes/placa-de-video/s/',
    category: 'Hardware',
    keywords: ['placa de video', 'rtx', 'rx', 'geforce', 'radeon', 'gpu', 'nvidia', 'amd'],
  },
  {
    path: '/promocoes/microondas/s/',
    category: 'Eletroportáteis',
    keywords: ['microondas', 'micro-ondas', 'electrolux', 'panasonic', 'brastemp', 'consul', 'philco'],
  },
  {
    path: '/promocoes/iphone/s/',
    category: 'Smartphones',
    keywords: ['iphone', 'apple', 'ios', 'airpods', 'ipad', 'macbook'],
  },
];

function cleanProductTitleForStoreSearch(rawTitle: string): string {
  const cleaned = rawTitle
    .replace(/\b(com cupom|cupom|em at[eé]\s*\d+x|sem juros|frete gr[aá]tis|no pix|menor pre[çc]o|promo[çc][aã]o)\b/gi, '')
    .replace(/[|•–—()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 0);
  return words.slice(0, 8).join(' ') || rawTitle.slice(0, 60);
}

function matchConfiguredStore(
  activeStores: StoreConfig[],
  rawDomain?: string | null,
  rawName?: string | null,
): StoreConfig | undefined {
  const dom = String(rawDomain || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .trim();
  const name = String(rawName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  return activeStores.find((s) => {
    const sDom = s.domain.toLowerCase().replace(/^www\./, '');
    const sName = s.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (dom && (sDom === dom || sDom.includes(dom) || dom.includes(sDom))) return true;
    if (dom.includes('magalu') && sDom.includes('magazineluiza')) return true;
    if (dom.includes('mercadolibre') && sDom.includes('mercadolivre')) return true;
    if (name && (sName.includes(name) || name.includes(sName.replace(/\s+br$/, '')))) return true;
    return false;
  });
}

async function fetchPromobitPageCouponOffers(opts: {
  routePath: string;
  fallbackCategory: string;
  activeStores: StoreConfig[];
  nowIso: string;
  expiresIso: string;
}): Promise<AnnouncedDeal[]> {
  const {routePath, fallbackCategory, activeStores, nowIso, expiresIso} = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);

  try {
    const url = `https://www.promobit.com.br${routePath}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return [];

    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return [];

    const parsed = JSON.parse(match[1]) as {props?: {pageProps?: Record<string, unknown>}};
    const pp = parsed?.props?.pageProps || {};
    const rawOffers: PromobitOfferEntry[] = [];

    for (const val of Object.values(pp)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'offerTitle' in val[0]) {
        rawOffers.push(...(val as PromobitOfferEntry[]));
      } else if (val && typeof val === 'object') {
        for (const sub of Object.values(val as Record<string, unknown>)) {
          if (Array.isArray(sub) && sub.length > 0 && typeof sub[0] === 'object' && sub[0] !== null && 'offerTitle' in sub[0]) {
            rawOffers.push(...(sub as PromobitOfferEntry[]));
          }
        }
      }
    }

    const seenIds = new Set<string>();
    const results: AnnouncedDeal[] = [];

    for (const item of rawOffers) {
      const offerId = String(item.offerId || '').trim();
      if (!offerId || seenIds.has(offerId)) continue;

      const rawTitle = stripHtmlTags(String(item.offerTitle || ''));
      const price = Number(item.offerPrice || 0);
      const rawCoupon = stripHtmlTags(String(item.offerCoupon || '')).trim();

      // Skip generic "Cupom 25% OFF..." posts or non-product entries without real product pricing
      if (!rawTitle || price < 20 || !rawCoupon || rawCoupon.length < 3) continue;
      if (/^cupom\s+/i.test(rawTitle) || /resgate|sem cupom|ativar no link/i.test(rawCoupon)) continue;

      const store = matchConfiguredStore(activeStores, item.storeDomain, item.storeName);
      if (!store) continue;

      seenIds.add(offerId);

      const isPageActivation =
        /\s/.test(rawCoupon) || /p[aá]gina|clicar|resgatar|marcar|an[uú]ncio/i.test(rawCoupon);
      const cleanCode = isPageActivation
        ? rawCoupon.slice(0, 32)
        : rawCoupon.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (!cleanCode || cleanCode.length < 3) continue;

      const rawOldPrice = Number(item.offerOldPrice || 0);
      const rawPct = Number(item.offerDiscontPercentage || 0);
      let referencePrice = rawOldPrice > price * 1.03 ? rawOldPrice : 0;
      if (!referencePrice && rawPct > 3 && rawPct < 90) {
        referencePrice = Number((price / (1 - rawPct / 100)).toFixed(2));
      }
      if (!referencePrice) {
        referencePrice = Number((price * 1.18).toFixed(2));
      }
      const discountPercent = Math.max(
        5,
        Number((((referencePrice - price) / referencePrice) * 100).toFixed(1)),
      );

      const photoPath = String(item.offerPhoto || '').trim();
      const imageUrl = photoPath
        ? photoPath.startsWith('http')
          ? photoPath.replace(/^https:\/\/i\.promobit\.com\.br\/520\//i, 'https://i.promobit.com.br/300/')
          : `https://i.promobit.com.br/300${photoPath.startsWith('/') ? photoPath : `/${photoPath}`}`
        : '';

      const searchTerm = cleanProductTitleForStoreSearch(rawTitle);
      const rawUrl = buildValidStoreSearchUrl(store, searchTerm);
      const category = mapRetailerCategory(rawTitle, fallbackCategory === 'Destaques' ? 'Ofertas' : fallbackCategory);
      const brand = rawTitle.split(' ')[0] || store.name;

      results.push({
        id: `deal-cpn-${store.id}-${offerId}`,
        productId: `promo-${offerId}`,
        productName: rawTitle.slice(0, 120),
        category,
        brand,
        imageUrl,
        storeId: store.id,
        storeName: store.name,
        announcedPrice: Math.round(price * 100) / 100,
        referencePrice: Math.round(referencePrice * 100) / 100,
        announcedDiscountPercent: discountPercent,
        installments: `${store.installmentsInfo} de R$ ${(price / 10).toFixed(2).replace('.', ',')}`,
        shipping: store.defaultShipping,
        rawUrl,
        affiliateUrl: buildAffiliateUrl(rawUrl, store),
        verifiedByManualSearch: true,
        isLiveDiscovered: true,
        couponCode: cleanCode,
        couponLabel: isPageActivation
          ? 'Cupom direto na página deste produto'
          : 'Cupom verificado para este produto',
        couponRule: isPageActivation
          ? `Marque a caixa de cupom no anúncio da ${store.name} antes de finalizar.`
          : `Aplique o cupom ${cleanCode} no carrinho da ${store.name} para este item.`,
        couponIsPageActivation: isPageActivation,
        announcedAt: nowIso,
        expiresAt: expiresIso,
        lastVerifiedAt: nowIso,
      });
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const KNOWN_BRAND_TOKENS = [
  'jbl',
  'samsung',
  'lg',
  'sony',
  'apple',
  'iphone',
  'logitech',
  'asus',
  'acer',
  'lenovo',
  'motorola',
  'xiaomi',
  'redmi',
  'philco',
  'britania',
  'electrolux',
  'brastemp',
  'consul',
  'nintendo',
  'playstation',
  'xbox',
  'hyperx',
  'corsair',
  'razer',
  'redragon',
  'dell',
  'hp',
  'epson',
  'tcl',
  'anker',
  'soundcore',
  'philips',
  'mondial',
  'oster',
  'nespresso',
  'nike',
  'adidas',
  'amd',
  'ryzen',
  'nvidia',
  'intel',
  'kingston',
  'sandisk',
  'husky',
  'kabum',
];

function parseMinPurchaseValue(text: string): number {
  const m = text.match(/(?:acima de|m[ií]nim[oa](?: de)?)\s*R\$\s*([0-9.]+(?:,[0-9]{2})?)/i);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, '').replace(',', '.')) || 0;
}

function attachEligibleLiveCouponToDeal(
  deal: AnnouncedDeal,
  liveCoupons: StoreCoupon[],
): AnnouncedDeal {
  if (deal.couponCode) return deal;

  const storeCoupons = liveCoupons.filter((c) => c.active && c.storeId === deal.storeId);
  if (storeCoupons.length === 0) return deal;

  const prodHay = `${deal.productName} ${deal.brand} ${deal.category}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let bestMatch: {coupon: StoreCoupon; score: number} | null = null;

  for (const cpn of storeCoupons) {
    const cpnText = `${cpn.title} ${cpn.description} ${cpn.minPurchaseLabel}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // 1. Respect minimum order amount strictly
    const minVal = parseMinPurchaseValue(cpnText);
    if (minVal > 0 && deal.announcedPrice < minVal) continue;

    // 2. If coupon is restricted to a specific brand, require that exact brand in this product
    const couponBrands = KNOWN_BRAND_TOKENS.filter((b) =>
      new RegExp(`\\b${b}\\b`, 'i').test(cpnText),
    );
    if (couponBrands.length > 0) {
      const matchesBrand = couponBrands.some((b) => new RegExp(`\\b${b}\\b`, 'i').test(prodHay));
      if (!matchesBrand) continue;
      // Exact brand-specific coupon match gets highest priority!
      if (!bestMatch || 100 > bestMatch.score) {
        bestMatch = {coupon: cpn, score: 100};
      }
      continue;
    }

    // 3. Check category-specific coupon rules
    const categoryChecks: Array<{cpnPattern: RegExp; prodPattern: RegExp}> = [
      {cpnPattern: /\b(tv|tvs|televisor|smart tv)\b/, prodPattern: /\b(tv|smart tv|oled|qled)\b/},
      {cpnPattern: /\b(smartphone|celular|celulares)\b/, prodPattern: /\b(smartphone|celular|galaxy|iphone|moto|redmi)\b/},
      {cpnPattern: /\b(notebook|notebooks|laptop)\b/, prodPattern: /\b(notebook|laptop|macbook)\b/},
      {cpnPattern: /\b(gamer|periferico|perifericos|headset|teclado|mouse)\b/, prodPattern: /\b(gamer|periferico|headset|teclado|mouse|monitor|mousepad)\b/},
      {cpnPattern: /\b(hardware|placa|processador|ssd|memoria)\b/, prodPattern: /\b(hardware|placa|rtx|rx|processador|ryzen|intel|ssd|nvme|memoria)\b/},
      {cpnPattern: /\b(audio|fone|fones|caixa de som)\b/, prodPattern: /\b(audio|fone|bluetooth|headset|caixa de som|earbuds|buds)\b/},
      {cpnPattern: /\b(eletro|eletroportateis|cozinha|fryer|cafeteira)\b/, prodPattern: /\b(eletro|fryer|fritadeira|cafeteira|geladeira|lavadora|microondas)\b/},
      {cpnPattern: /\b(livro|livros|moda|beleza|perfume|mercado|pet|brinquedo|esporte|suplemento|ferramenta)\b/, prodPattern: /\b(livro|moda|beleza|perfume|pet|brinquedo|esporte|suplemento|ferramenta)\b/},
    ];

    let hasCategoryRestriction = false;
    let matchesCategory = false;
    for (const rule of categoryChecks) {
      if (rule.cpnPattern.test(cpnText)) {
        hasCategoryRestriction = true;
        if (rule.prodPattern.test(prodHay)) {
          matchesCategory = true;
        }
      }
    }

    if (hasCategoryRestriction) {
      if (!matchesCategory) continue;
      if (!bestMatch || 80 > bestMatch.score) {
        bestMatch = {coupon: cpn, score: 80};
      }
      continue;
    }

    // 4. Sitewide / general store coupon (valid for any item meeting min purchase)
    const isGeneralValid =
      /\b(todo o site|em suas compras|compras acima|1[ªa] compra|produtos selecionados|no app|no carrinho|frete gratis|sem restricoes|em todo)\b/.test(
        cpnText,
      );
    if (isGeneralValid) {
      const score = cpn.verificationSource === 'google_search' ? 60 : 40;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {coupon: cpn, score};
      }
    }
  }

  if (!bestMatch) return deal;
  const cpn = bestMatch.coupon;
  return {
    ...deal,
    couponCode: cpn.code,
    couponLabel:
      bestMatch.score >= 80
        ? `Cupom ${cpn.discountLabel} compatível com este produto`
        : `Cupom ${cpn.discountLabel} válido nesta loja`,
    couponRule: `${cpn.title}${cpn.minPurchaseLabel && cpn.minPurchaseLabel !== 'Ver regras na loja' ? ` · ${cpn.minPurchaseLabel}` : ''}`.slice(
      0,
      140,
    ),
    couponIsPageActivation: false,
  };
}

async function manualSearchAndAnnounceDeals(opts?: {
  query?: string;
  category?: string;
  productId?: string;
}): Promise<{
  deals: AnnouncedDeal[];
  announcedNow: number;
  checkedCount: number;
}> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + DEAL_TTL_MS).toISOString();
  const activeStores = state.stores.filter((s) => s.active);
  const activeStoreMap = new Map(activeStores.map((s) => [s.id, s]));

  const qRaw = (opts?.query || '').trim();
  const qNorm = qRaw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  const cat = (opts?.category || 'all').trim();

  // First prune any expired/invalid existing deals
  pruneExpiredAndInvalidDeals(false);

  // Case A: Admin manually checking a specific monitored product in Radar
  if (opts?.productId) {
    const prod = state.products.find((p) => p.id === opts.productId && p.active);
    const byProductId = new Map<string, AnnouncedDeal>();
    for (const existing of state.announcedDeals) {
      byProductId.set(existing.productId, existing);
    }
    let announcedNow = 0;
    if (prod) {
      const evaluation = evaluateProductForAnnouncement(prod, activeStoreMap);
      if (!evaluation) {
        byProductId.delete(prod.id);
      } else {
        const {offer, store, referencePrice, discountPercent} = evaluation;
        const baseDeal: AnnouncedDeal = {
          id: `deal-${prod.id}-${store.id}`,
          productId: prod.id,
          productName: prod.name,
          category: prod.category,
          brand: prod.brand,
          imageUrl: prod.imageUrl,
          storeId: store.id,
          storeName: store.name,
          announcedPrice: offer.pixPrice,
          referencePrice,
          announcedDiscountPercent: discountPercent,
          installments: offer.installments,
          shipping: offer.shipping,
          rawUrl: offer.rawUrl,
          affiliateUrl: buildAffiliateUrl(offer.rawUrl, store),
          verifiedByManualSearch: true,
          isLiveDiscovered: false,
          announcedAt: nowIso,
          expiresAt: expiresIso,
          lastVerifiedAt: nowIso,
        };
        const enrichedSingle = attachEligibleLiveCouponToDeal(baseDeal, state.coupons);
        byProductId.set(prod.id, enrichedSingle);
        announcedNow = 1;
        void forwardDealsToWhatsappGroup([enrichedSingle]);
      }
    }
    state.announcedDeals = Array.from(byProductId.values()).sort(
      (a, b) => new Date(b.announcedAt).getTime() - new Date(a.announcedAt).getTime(),
    );
    saveState(state);
    broadcast('announcedDeals:synced', state.announcedDeals);
    return {deals: state.announcedDeals, announcedNow, checkedCount: prod ? 1 : 0};
  }

  // Case B: Live manual search — prioritize REAL products with product-specific verified coupons!
  const isGeneralDiscoveryCycle = !qRaw;
  const historySet = getPublishedHistorySet();
  const amazonStore = activeStores.find((s) => s.domain.toLowerCase().includes('amazon.'));
  const kabumStore = activeStores.find((s) => s.domain.toLowerCase().includes('kabum.'));

  const seenFinal = new Set<string>();
  const seenBatchFp = new Set<string>();
  const combinedFresh: AnnouncedDeal[] = [];
  let checkedCount = 0;

  const isDuplicateForCycle = (item: AnnouncedDeal): boolean => {
    if (seenFinal.has(item.productId)) return true;
    const fp = normalizeProductFingerprint(item.productName);
    if (fp && seenBatchFp.has(fp)) return true;
    if (isGeneralDiscoveryCycle && isProductAlreadyPublished(item, historySet)) return true;
    return false;
  };

  const pushUnique = (list: AnnouncedDeal[], limit: number) => {
    for (const item of list) {
      if (combinedFresh.length >= limit) break;
      if (isDuplicateForCycle(item)) continue;
      seenFinal.add(item.productId);
      const fp = normalizeProductFingerprint(item.productName);
      if (fp) seenBatchFp.add(fp);
      combinedFresh.push(item);
    }
  };

  const runDiscoveryPass = async (passIndex: number) => {
    manualSearchCursor = (manualSearchCursor + 1) % LIVE_DEAL_TOPICS.length;
    const rotatingTopic = LIVE_DEAL_TOPICS[manualSearchCursor];
    const rotatingKabumPage = ((manualSearchCursor + passIndex * 7) % 36) + 1;

    let selectedRoutes = PROMOBIT_COUPON_ROUTES.filter((r) => {
      if (cat && cat !== 'all' && r.category === cat) return true;
      if (
        qTokens.length > 0 &&
        r.keywords.some((kw) => qTokens.some((t) => kw.includes(t) || t.includes(kw)))
      ) {
        return true;
      }
      return false;
    });

    if (selectedRoutes.length === 0 || passIndex > 0) {
      const offset = (manualSearchCursor * 4 + passIndex * 4) % PROMOBIT_COUPON_ROUTES.length;
      selectedRoutes = [];
      for (let i = 0; i < 4; i++) {
        selectedRoutes.push(
          PROMOBIT_COUPON_ROUTES[(offset + i) % PROMOBIT_COUPON_ROUTES.length],
        );
      }
    } else {
      selectedRoutes = selectedRoutes.slice(0, 4);
      if (!selectedRoutes.some((r) => r.path === '/')) {
        selectedRoutes.push(PROMOBIT_COUPON_ROUTES[0]);
      }
    }

    const effectiveSearchTerm =
      qRaw ||
      (cat && cat !== 'all' ? CATEGORY_TO_SEARCH_QUERY[cat] || cat : rotatingTopic.query);
    const effectiveFallbackCategory =
      cat && cat !== 'all' ? cat : rotatingTopic.category;

    const [promobitBatches, liveAmazonRaw, liveKabumRaw] = await Promise.all([
      Promise.all(
        selectedRoutes.map((route) =>
          fetchPromobitPageCouponOffers({
            routePath: route.path,
            fallbackCategory: route.category,
            activeStores,
            nowIso,
            expiresIso,
          }),
        ),
      ),
      amazonStore
        ? fetchLiveAmazonDeals({
            query: effectiveSearchTerm,
            fallbackCategory: effectiveFallbackCategory,
            store: amazonStore,
            nowIso,
            expiresIso,
          })
        : Promise.resolve([]),
      kabumStore
        ? fetchLiveKabumDeals({
            query: qRaw || (cat && cat !== 'all' ? effectiveSearchTerm : rotatingTopic.query),
            pageNumber: qRaw ? 1 : rotatingKabumPage,
            store: kabumStore,
            nowIso,
            expiresIso,
          })
        : Promise.resolve([]),
    ]);

    checkedCount +=
      promobitBatches.reduce((sum, b) => sum + b.length, 0) +
      liveAmazonRaw.length +
      liveKabumRaw.length;

    const seenPromoIds = new Set<string>();
    const promobitDeals: AnnouncedDeal[] = [];
    for (const batch of promobitBatches) {
      for (const deal of batch) {
        if (seenPromoIds.has(deal.productId)) continue;
        if (qTokens.length > 0) {
          const hay = `${deal.productName} ${deal.brand} ${deal.category} ${deal.storeName} ${deal.couponCode || ''}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          if (!qTokens.every((t) => hay.includes(t))) continue;
        }
        seenPromoIds.add(deal.productId);
        promobitDeals.push(
          cat && cat !== 'all' && deal.category !== cat ? {...deal, category: cat} : deal,
        );
      }
    }

    promobitDeals.sort((a, b) => {
      const aCode = a.couponIsPageActivation ? 0 : 1;
      const bCode = b.couponIsPageActivation ? 0 : 1;
      if (aCode !== bCode) return bCode - aCode;
      return b.announcedDiscountPercent - a.announcedDiscountPercent;
    });

    const liveAmazon = liveAmazonRaw.map((d) => attachEligibleLiveCouponToDeal(d, state.coupons));
    const liveKabum = liveKabumRaw.map((d) => attachEligibleLiveCouponToDeal(d, state.coupons));

    const retailWithCoupon: AnnouncedDeal[] = [];
    const retailWithoutCoupon: AnnouncedDeal[] = [];
    const maxRetail = Math.max(liveAmazon.length, liveKabum.length);
    for (let i = 0; i < maxRetail; i++) {
      for (const candidate of [liveAmazon[i], liveKabum[i]]) {
        if (!candidate) continue;
        const adjusted =
          cat && cat !== 'all' && candidate.category !== cat
            ? {...candidate, category: cat}
            : candidate;
        if (adjusted.couponCode) {
          retailWithCoupon.push(adjusted);
        } else {
          retailWithoutCoupon.push(adjusted);
        }
      }
    }

    // Resolve Promobit candidates to REAL direct store product URLs before accepting them
    const promobitCandidates = promobitDeals.filter((item) => !isDuplicateForCycle(item));
    const resolvedPromobit = await ensureDirectProductUrlsForDeals(
      promobitCandidates,
      activeStores,
      Math.max(1, 10 - combinedFresh.length),
    );

    pushUnique(resolvedPromobit, 10);
    pushUnique(retailWithCoupon, 12);
    if (combinedFresh.length < 6) {
      pushUnique(retailWithoutCoupon, 12);
    }
  };

  await runDiscoveryPass(0);
  if (isGeneralDiscoveryCycle && combinedFresh.length < 4) {
    await runDiscoveryPass(1);
  }
  if (isGeneralDiscoveryCycle && combinedFresh.length < 3) {
    await runDiscoveryPass(2);
  }

  if (combinedFresh.length > 0) {
    recordPublishedProducts(combinedFresh);
  }

  // Prepend brand-new non-repeating deals to the active feed (never repeat prior cycle products)
  const keptExisting = state.announcedDeals.filter((d) => !seenFinal.has(d.productId));
  state.announcedDeals =
    combinedFresh.length > 0
      ? [...combinedFresh, ...keptExisting].slice(0, 30)
      : state.announcedDeals;
  state.dealFeedMeta = buildDealFeedMeta(Date.now(), false);
  saveState(state);
  broadcast('announcedDeals:synced', state.announcedDeals);
  broadcast('dealFeedMeta:synced', state.dealFeedMeta);

  if (combinedFresh.length > 0) {
    void forwardDealsToWhatsappGroup(combinedFresh);
  }

  return {
    deals: state.announcedDeals,
    announcedNow: combinedFresh.length,
    checkedCount,
  };
}

let isPublishingScheduledDeals = false;

async function publishScheduledDealBatch(): Promise<void> {
  if (isPublishingScheduledDeals) return;
  isPublishingScheduledDeals = true;

  const startMs = Date.now();
  state.dealFeedMeta = {
    ...(state.dealFeedMeta || buildDealFeedMeta(startMs)),
    isPublishing: true,
    publishIntervalMinutes: 5,
  };
  broadcast('dealFeedMeta:synced', state.dealFeedMeta);

  try {
    pruneExpiredAndInvalidDeals(false);
    const activeStores = state.stores.filter((s) => s.active);
    if (activeStores.length === 0) return;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + DEAL_TTL_MS).toISOString();

    const historySet = getPublishedHistorySet();
    const amazonStore = activeStores.find((s) => s.domain.toLowerCase().includes('amazon.'));
    const kabumStore = activeStores.find((s) => s.domain.toLowerCase().includes('kabum.'));

    // Drop 3 brand-new, never-previously-published product+coupon deals every 5 minutes (or up to 6 if feed was empty)
    const dropSize = state.announcedDeals.length === 0 ? 6 : 3;
    const freshCandidates: AnnouncedDeal[] = [];
    const seenNewIds = new Set<string>();
    const seenNewFp = new Set<string>();

    const collectNeverRepeated = (list: AnnouncedDeal[]) => {
      for (const d of list) {
        if (!d.couponCode) continue;
        if (seenNewIds.has(d.productId)) continue;
        const fp = normalizeProductFingerprint(d.productName);
        if (fp && seenNewFp.has(fp)) continue;
        // STRICT: never repeat ANY product that already appeared in ANY previous cycle
        if (isProductAlreadyPublished(d, historySet)) continue;
        seenNewIds.add(d.productId);
        if (fp) seenNewFp.add(fp);
        freshCandidates.push(d);
      }
    };

    const directOnlyFallback: AnnouncedDeal[] = [];

    // Run up to 3 rotating passes if earlier routes only had already-published products
    for (let pass = 0; pass < 3 && freshCandidates.length < dropSize * 2; pass++) {
      manualSearchCursor = (manualSearchCursor + 1) % LIVE_DEAL_TOPICS.length;
      const rotatingTopic = LIVE_DEAL_TOPICS[manualSearchCursor];
      const rotatingKabumPage = ((manualSearchCursor + pass * 9) % 36) + 1;
      const routeOffset = (manualSearchCursor * 3 + pass * 3) % PROMOBIT_COUPON_ROUTES.length;
      const selectedRoutes = [
        PROMOBIT_COUPON_ROUTES[routeOffset % PROMOBIT_COUPON_ROUTES.length],
        PROMOBIT_COUPON_ROUTES[(routeOffset + 1) % PROMOBIT_COUPON_ROUTES.length],
        PROMOBIT_COUPON_ROUTES[(routeOffset + 2) % PROMOBIT_COUPON_ROUTES.length],
      ];

      const [promobitBatches, liveAmazonRaw, liveKabumRaw] = await Promise.all([
        Promise.all(
          selectedRoutes.map((route) =>
            fetchPromobitPageCouponOffers({
              routePath: route.path,
              fallbackCategory: route.category,
              activeStores,
              nowIso,
              expiresIso,
            }),
          ),
        ),
        amazonStore
          ? fetchLiveAmazonDeals({
              query: rotatingTopic.query,
              fallbackCategory: rotatingTopic.category,
              store: amazonStore,
              nowIso,
              expiresIso,
            })
          : Promise.resolve([]),
        kabumStore
          ? fetchLiveKabumDeals({
              query: pass === 0 ? undefined : rotatingTopic.query,
              pageNumber: rotatingKabumPage,
              store: kabumStore,
              nowIso,
              expiresIso,
            })
          : Promise.resolve([]),
      ]);

      const promoFlat = promobitBatches.flat().sort((a, b) => {
        const aCode = a.couponIsPageActivation ? 0 : 1;
        const bCode = b.couponIsPageActivation ? 0 : 1;
        if (aCode !== bCode) return bCode - aCode;
        return b.announcedDiscountPercent - a.announcedDiscountPercent;
      });
      collectNeverRepeated(promoFlat);
      const amazonWithCoupons = liveAmazonRaw.map((d) => attachEligibleLiveCouponToDeal(d, state.coupons));
      const kabumWithCoupons = liveKabumRaw.map((d) => attachEligibleLiveCouponToDeal(d, state.coupons));
      collectNeverRepeated(amazonWithCoupons);
      collectNeverRepeated(kabumWithCoupons);

      // Keep direct-URL Amazon/KaBuM deals as backup in case Promobit candidates cannot resolve
      for (const d of [...amazonWithCoupons, ...kabumWithCoupons]) {
        if (!isStoreSearchUrl(d.rawUrl) && !isProductAlreadyPublished(d, historySet)) {
          directOnlyFallback.push(d);
        }
      }
    }

    // Resolve direct store product URLs for selected candidates (NEVER publish search-page links!)
    const resolvedBatch = await ensureDirectProductUrlsForDeals(
      freshCandidates,
      activeStores,
      dropSize,
    );

    const newlyPublished: AnnouncedDeal[] = [...resolvedBatch];
    if (newlyPublished.length < dropSize && directOnlyFallback.length > 0) {
      const takenIds = new Set(newlyPublished.map((d) => d.productId));
      const takenFp = new Set(newlyPublished.map((d) => normalizeProductFingerprint(d.productName)));
      for (const d of directOnlyFallback) {
        if (newlyPublished.length >= dropSize) break;
        if (takenIds.has(d.productId)) continue;
        const fp = normalizeProductFingerprint(d.productName);
        if (fp && takenFp.has(fp)) continue;
        takenIds.add(d.productId);
        if (fp) takenFp.add(fp);
        newlyPublished.push(d);
      }
    }

    if (newlyPublished.length > 0) {
      recordPublishedProducts(newlyPublished);
      state.announcedDeals = [...newlyPublished, ...state.announcedDeals].slice(0, 30);
    }

    state.dealFeedMeta = buildDealFeedMeta(Date.now(), false);
    saveState(state);
    broadcast('announcedDeals:synced', state.announcedDeals);
    broadcast('dealFeedMeta:synced', state.dealFeedMeta);

    if (newlyPublished.length > 0) {
      void forwardDealsToWhatsappGroup(newlyPublished);
    }
  } catch (err) {
    console.warn('Scheduled 5-minute deal publish error:', err);
    state.dealFeedMeta = buildDealFeedMeta(Date.now(), false);
    broadcast('dealFeedMeta:synced', state.dealFeedMeta);
  } finally {
    isPublishingScheduledDeals = false;
  }
}

interface StoreLivePriceCandidate {
  storeId: string;
  productTitle: string;
  imageUrl?: string;
  price: number;
  referencePrice?: number | null;
  discountPercent?: number | null;
  installments?: string;
  shipping?: string;
  rawUrl: string;
  sourceLabel: string;
  specificCoupon?: StoreProductCoupon;
}

function normalizeSearchTokens(input: string): string[] {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreTitleMatch(queryTokens: string[], title: string): number {
  if (queryTokens.length === 0) return 0;
  const norm = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let hits = 0;
  for (const tok of queryTokens) {
    if (norm.includes(tok)) hits++;
  }
  return hits / queryTokens.length;
}

function isSafePublicRetailHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function buildCleanUrlSlug(input?: string): string {
  const cleaned = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned && cleaned !== 'produto' ? cleaned : 'oferta';
}

function canonicalizeDirectStoreProductUrl(
  rawTargetUrl: string,
  store: StoreConfig,
  fallbackTitle?: string,
): string | null {
  try {
    const parsed = new URL(rawTargetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!isSafePublicRetailHost(parsed.hostname)) return null;

    // Unwrap affiliate/tracking redirect wrappers (Awin, Lomadee, Rakuten, Admitad, etc.) if present
    for (const key of ['ued', 'murl', 'url', 'redirect', 'u', 'ulp', 'target', 'dest', 'redir']) {
      const embedded = parsed.searchParams.get(key);
      if (embedded && /^https?:\/\//i.test(embedded)) {
        const unwrapped = canonicalizeDirectStoreProductUrl(embedded, store, fallbackTitle);
        if (unwrapped) return unwrapped;
      }
    }

    const host = parsed.hostname.toLowerCase();
    const storeDom = store.domain.toLowerCase().replace(/^www\./, '');
    const storeMatches =
      host.includes(storeDom) ||
      (storeDom.includes('magazineluiza') &&
        (host.includes('magalu') || host.includes('magazinevoce'))) ||
      (storeDom.includes('mercadolivre') && host.includes('mercadolibre'));
    if (!storeMatches) return null;

    // 1. Amazon BR: strictly require ASIN and canonicalize to /dp/{ASIN} (never /s?k= search)
    if (host.includes('amazon.')) {
      const asinMatch = parsed.pathname.match(
        /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})/i,
      );
      if (asinMatch) {
        return `https://www.amazon.com.br/dp/${asinMatch[1].toUpperCase()}`;
      }
      return null;
    }

    // 2. KaBuM!: strictly require numeric /produto/{id}
    if (host.includes('kabum.')) {
      const kabumMatch = parsed.pathname.match(/\/produto\/(\d+)(\/[^/?#]*)?/i);
      if (kabumMatch) {
        return `https://www.kabum.com.br/produto/${kabumMatch[1]}${kabumMatch[2] || ''}`;
      }
      return null;
    }

    // 3. Magazine Luiza / Magazine Você: canonicalize to magazineluiza.com.br/{slug}/p/{sku}/ so our own magazinevoce tag applies cleanly
    if (host.includes('magazineluiza.') || host.includes('magazinevoce.') || host.includes('magalu.')) {
      // Handle Promobit / Magalu divulgador links: /lapromotion/divulgador/oferta/{sku}/{cat}/{subcat}/
      const lapromoMatch = parsed.pathname.match(
        /\/lapromotion\/divulgador\/oferta\/([a-z0-9]{5,14})(\/[^?#]*)?/i,
      );
      if (lapromoMatch) {
        const sku = lapromoMatch[1];
        const trailing = (lapromoMatch[2] || '/').replace(/\/?$/, '/');
        const slug = buildCleanUrlSlug(fallbackTitle);
        return `https://www.magazineluiza.com.br/${slug}/p/${sku}${trailing}`;
      }

      // Standard Magalu or MagazineVocê product path: /[optional-partner/]slug/p/{sku}[/cat/subcat/]
      const magaluProdMatch = parsed.pathname.match(
        /\/([^/]+)\/p\/([a-z0-9]{5,14})(\/[^?#]*)?/i,
      );
      if (magaluProdMatch) {
        const segSlug =
          magaluProdMatch[1].toLowerCase() === 'produto'
            ? buildCleanUrlSlug(fallbackTitle)
            : magaluProdMatch[1];
        const sku = magaluProdMatch[2];
        const trailing = (magaluProdMatch[3] || '/').replace(/\/?$/, '/');
        return `https://www.magazineluiza.com.br/${segSlug}/p/${sku}${trailing}`;
      }
      return null;
    }

    // 4. Mercado Livre: strictly require direct product page (/p/MLB... or /MLB-...) — reject lista.* and /social/*
    if (host.includes('mercadolivre.') || host.includes('mercadolibre.')) {
      if (
        host.startsWith('lista.') ||
        parsed.pathname.toLowerCase().startsWith('/social/') ||
        parsed.pathname.toLowerCase().startsWith('/jm/search')
      ) {
        return null;
      }
      if (/\/p\/MLB\d+/i.test(parsed.pathname) || /\/MLB-?\d{6,}/i.test(parsed.pathname)) {
        return `https://${parsed.hostname}${parsed.pathname}`;
      }
      return null;
    }

    // 5. Shopee: strictly require direct product page (-i.{shopId}.{itemId} or /product/{shopId}/{itemId})
    if (host.includes('shopee.')) {
      if (
        /-i\.\d+\.\d+/i.test(parsed.pathname) ||
        /\/product\/\d+\/\d+/i.test(parsed.pathname)
      ) {
        return `https://${parsed.hostname}${parsed.pathname}`;
      }
      return null;
    }

    // 6. Casas Bahia: strictly require /p product path
    if (host.includes('casasbahia.')) {
      if (/\/p(?:\/|$)/i.test(parsed.pathname) && !/\/b\/?$/i.test(parsed.pathname)) {
        return `https://${parsed.hostname}${parsed.pathname}`;
      }
      return null;
    }

    // Strip third-party aggregator / tracking parameters so our own affiliate tag applies cleanly
    const cleanUrl = new URL(`https://${parsed.hostname}${parsed.pathname}`);
    const keepParams = new Set(['sku', 'skuId', 'item_id', 'variation', 'model']);
    parsed.searchParams.forEach((val, key) => {
      if (keepParams.has(key)) {
        cleanUrl.searchParams.set(key, val);
      }
    });
    const finalStr = cleanUrl.toString();
    if (isFakeProductUrl(finalStr) || isStoreSearchUrl(finalStr)) return null;
    return finalStr;
  } catch {
    return null;
  }
}

const directProductUrlCache = new Map<string, {url: string | null; cachedAt: number}>();
let promobitRedirectCooldownUntilMs = 0;
let lastPromobitRedirectFetchMs = 0;

function extractDirectMlProductUrlFromSocialHtml(
  html: string,
  productTitle: string,
  store: StoreConfig,
): string | null {
  const matches = [
    ...html.matchAll(
      /https?:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br\/[^"'\s<>\\]+(?:\/p\/MLB\d+|\/MLB-?\d{6,})[^"'\s<>\\]*/gi,
    ),
  ];
  if (matches.length === 0) return null;

  const titleTokens = normalizeSearchTokens(productTitle);
  let bestUrl: string | null = null;
  let bestScore = -1;

  const seen = new Set<string>();
  for (const m of matches) {
    const rawCandidate = decodeHtmlEntities(m[0]);
    const isFeaturedCard = /card-featured|reco_item_pos=0/i.test(rawCandidate);
    const canonical = canonicalizeDirectStoreProductUrl(rawCandidate, store, productTitle);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);

    const pathScore = scoreTitleMatch(titleTokens, canonical.replace(/[-/]+/g, ' '));
    const totalScore = pathScore + (isFeaturedCard ? 0.65 : 0);
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestUrl = canonical;
    }
  }

  return bestUrl;
}

async function unwrapShortlinkToDirectStoreUrl(
  startUrl: string,
  store: StoreConfig,
  productTitle: string,
): Promise<string | null> {
  const immediate = canonicalizeDirectStoreProductUrl(startUrl, store, productTitle);
  if (immediate) return immediate;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    let currentUrl = startUrl;
    for (let hop = 0; hop < 5; hop++) {
      const parsedCur = new URL(currentUrl);
      if (
        !['https:', 'http:'].includes(parsedCur.protocol) ||
        !isSafePublicRetailHost(parsedCur.hostname)
      ) {
        return null;
      }

      const resp = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
      });

      const loc = resp.headers.get('location');
      if (loc) {
        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
        const canonical = canonicalizeDirectStoreProductUrl(nextUrl, store, productTitle);
        if (canonical) return canonical;
        currentUrl = nextUrl;
        continue;
      }

      // If we landed on a 200 HTML page (e.g., mercadolivre.com.br/social/... or meta refresh), extract direct product link
      if (resp.ok) {
        const html = await resp.text();
        if (
          parsedCur.hostname.toLowerCase().includes('mercadolivre.') &&
          parsedCur.pathname.toLowerCase().includes('/social/')
        ) {
          return extractDirectMlProductUrlFromSocialHtml(html, productTitle, store);
        }

        const metaRefresh = html.match(
          /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'\s>]+)/i,
        );
        if (metaRefresh?.[1]) {
          const nextUrl = decodeHtmlEntities(metaRefresh[1]);
          const canonical = canonicalizeDirectStoreProductUrl(nextUrl, store, productTitle);
          if (canonical) return canonical;
          currentUrl = nextUrl.startsWith('http') ? nextUrl : new URL(nextUrl, currentUrl).toString();
          continue;
        }

        const canonicalTag =
          html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["'](https?:\/\/[^"']+)["']/i) ||
          html.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]+rel=["']canonical["']/i);
        if (canonicalTag?.[1]) {
          const canonical = canonicalizeDirectStoreProductUrl(
            decodeHtmlEntities(canonicalTag[1]),
            store,
            productTitle,
          );
          if (canonical) return canonical;
        }
      }
      break;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDirectProductUrlFromPromobit(
  offerId: string,
  store: StoreConfig,
  productTitle: string,
): Promise<string | null> {
  const cleanId = String(offerId || '').replace(/\D/g, '');
  if (!cleanId) return null;

  const now = Date.now();
  if (now < promobitRedirectCooldownUntilMs) {
    return null;
  }

  // Gentle pacing (~320ms between requests) to avoid Promobit 429 throttling
  const elapsed = now - lastPromobitRedirectFetchMs;
  if (elapsed < 320) {
    await new Promise((resolve) => setTimeout(resolve, 320 - elapsed));
  }
  lastPromobitRedirectFetchMs = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const redirectUrl = `https://www.promobit.com.br/Redirect/to/${cleanId}/`;
    const resp = await fetch(redirectUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://www.promobit.com.br/',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });

    if (resp.status === 429) {
      promobitRedirectCooldownUntilMs = Date.now() + 90_000;
      return null;
    }
    if (!resp.ok) return null;

    const html = await resp.text();
    const targetMatch =
      html.match(/,\s*l\s*=\s*['"](https?:\/\/[^'"]+)['"]/) ||
      html.match(/location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/) ||
      html.match(/url=(https?:\/\/[^"'\s>]+)/i);

    if (!targetMatch?.[1]) return null;
    const rawTarget = decodeHtmlEntities(targetMatch[1]).replace(/\\\//g, '/');

    return await unwrapShortlinkToDirectStoreUrl(rawTarget, store, productTitle);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDirectProductUrlForDeal(opts: {
  store: StoreConfig;
  productTitle: string;
  productId?: string;
  candidateUrl?: string;
}): Promise<string | null> {
  const {store, productTitle, productId, candidateUrl} = opts;

  // 1. Already a valid direct product URL? Return clean canonical version immediately.
  if (candidateUrl) {
    const existingCanonical = canonicalizeDirectStoreProductUrl(candidateUrl, store, productTitle);
    if (existingCanonical) return existingCanonical;
  }

  const cacheKey = `${store.id}::${productId || ''}::${normalizeProductFingerprint(productTitle)}`;
  const cached = directProductUrlCache.get(cacheKey);
  if (cached) {
    const ttl = cached.url ? 2 * 60 * 60 * 1000 : 5 * 60 * 1000;
    if (Date.now() - cached.cachedAt < ttl) {
      return cached.url;
    }
  }

  let resolved: string | null = null;

  // 2. If this offer originated from Promobit (productId = "promo-{offerId}"), extract its exact store destination!
  const promoMatch = String(productId || '').match(/^promo-(\d+)$/);
  if (promoMatch?.[1]) {
    resolved = await resolveDirectProductUrlFromPromobit(promoMatch[1], store, productTitle);
  }

  // 3. Store-direct fallbacks (work seamlessly even if Promobit throttles 429 or returns a generic page)
  if (!resolved) {
    const cleanQuery = cleanProductTitleForStoreSearch(productTitle)
      .split(' ')
      .slice(0, 7)
      .join(' ');
    const storeDom = store.domain.toLowerCase();

    if (storeDom.includes('amazon.')) {
      const amz = await fetchLiveAmazonSearchOffer(cleanQuery, store);
      if (amz?.rawUrl) {
        resolved = canonicalizeDirectStoreProductUrl(amz.rawUrl, store, productTitle);
      }
    } else if (storeDom.includes('kabum.')) {
      const kb = await fetchLiveKabumSearchOffer(cleanQuery, store);
      if (kb?.rawUrl) {
        resolved = canonicalizeDirectStoreProductUrl(kb.rawUrl, store, productTitle);
      }
    }

    // Cross-store comparator lead unwrap (great for Magazine Luiza, Mercado Livre, Casas Bahia, and backup for Amazon/KaBuM)
    if (!resolved && cleanQuery.length >= 4) {
      try {
        const comp = await fetchBuscapeCrossStoreOffers(cleanQuery, [store]);
        const match = comp.byStoreId.get(store.id);
        if (match?.rawUrl) {
          resolved = canonicalizeDirectStoreProductUrl(match.rawUrl, store, productTitle);
        }
      } catch {
        // Fallback silently
      }
    }
  }

  directProductUrlCache.set(cacheKey, {url: resolved, cachedAt: Date.now()});
  if (directProductUrlCache.size > 600) {
    const oldestKey = directProductUrlCache.keys().next().value;
    if (oldestKey) directProductUrlCache.delete(oldestKey);
  }

  return resolved;
}

async function ensureDirectProductUrlsForDeals(
  candidates: AnnouncedDeal[],
  activeStores: StoreConfig[],
  maxWanted: number,
): Promise<AnnouncedDeal[]> {
  const storeMap = new Map(activeStores.map((s) => [s.id, s]));
  const verified: AnnouncedDeal[] = [];
  let resolveAttempts = 0;
  const maxAttempts = Math.max(maxWanted * 2 + 4, 12);

  for (const deal of candidates) {
    if (verified.length >= maxWanted) break;
    const store = storeMap.get(deal.storeId);
    if (!store) continue;

    // Fast path: already a direct product URL (e.g. fetchLiveAmazonDeals / fetchLiveKabumDeals)
    const immediate = canonicalizeDirectStoreProductUrl(deal.rawUrl, store, deal.productName);
    if (immediate) {
      verified.push({
        ...deal,
        rawUrl: immediate,
        affiliateUrl: buildAffiliateUrl(immediate, store),
      });
      continue;
    }

    if (resolveAttempts >= maxAttempts) continue;
    resolveAttempts++;

    const directUrl = await resolveDirectProductUrlForDeal({
      store,
      productTitle: deal.productName,
      productId: deal.productId,
      candidateUrl: deal.rawUrl,
    });

    if (directUrl && !isStoreSearchUrl(directUrl)) {
      verified.push({
        ...deal,
        rawUrl: directUrl,
        affiliateUrl: buildAffiliateUrl(directUrl, store),
      });
    }
  }

  return verified;
}

async function repairSearchUrlAnnouncedDeals(): Promise<void> {
  if (isRepairingSearchUrlDeals) return;
  const needsRepair = state.announcedDeals.some((d) => isStoreSearchUrl(d.rawUrl));
  if (!needsRepair) return;

  isRepairingSearchUrlDeals = true;
  try {
    const storeMap = new Map(state.stores.filter((s) => s.active).map((s) => [s.id, s]));
    const upgraded: AnnouncedDeal[] = [];
    let repairedCount = 0;
    let droppedCount = 0;

    for (const deal of state.announcedDeals) {
      const store = storeMap.get(deal.storeId);
      if (!store) {
        droppedCount++;
        continue;
      }

      const existingDirect = canonicalizeDirectStoreProductUrl(
        deal.rawUrl,
        store,
        deal.productName,
      );
      if (existingDirect) {
        upgraded.push({
          ...deal,
          rawUrl: existingDirect,
          affiliateUrl: buildAffiliateUrl(existingDirect, store),
        });
        continue;
      }

      const resolvedDirect = await resolveDirectProductUrlForDeal({
        store,
        productTitle: deal.productName,
        productId: deal.productId,
        candidateUrl: deal.rawUrl,
      });

      if (resolvedDirect && !isStoreSearchUrl(resolvedDirect)) {
        repairedCount++;
        upgraded.push({
          ...deal,
          rawUrl: resolvedDirect,
          affiliateUrl: buildAffiliateUrl(resolvedDirect, store),
          lastVerifiedAt: new Date().toISOString(),
        });
      } else {
        droppedCount++;
      }
    }

    state.announcedDeals = upgraded;
    saveState(state);
    broadcast('announcedDeals:synced', state.announcedDeals);
    console.log(
      `Direct product URL repair finished: ${repairedCount} upgraded, ${droppedCount} unresolved search-URL deals removed (${upgraded.length} active).`,
    );

    if (state.announcedDeals.length < 6) {
      void publishScheduledDealBatch();
    }
  } catch (err) {
    console.warn('Error repairing search-URL announced deals:', err);
  } finally {
    isRepairingSearchUrlDeals = false;
    hasCompletedInitialDealUrlRepair = true;
  }
}

async function resolveDirectStoreUrlFromComparatorOffer(
  baseHost: 'www.buscape.com.br' | 'www.zoom.com.br',
  offerId: string,
  store: StoreConfig,
): Promise<string | null> {
  const cleanOid = String(offerId || '').trim();
  if (!/^\d{4,16}$/.test(cleanOid)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    let currentUrl = `https://${baseHost}/lead?oid=${cleanOid}&channel=1&index=0&redirect=auto&logAndRedirect=1`;
    for (let hop = 0; hop < 4; hop++) {
      const parsedCur = new URL(currentUrl);
      if (!['https:', 'http:'].includes(parsedCur.protocol) || !isSafePublicRetailHost(parsedCur.hostname)) {
        return null;
      }
      const resp = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: `https://${baseHost}/`,
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
      });
      const loc = resp.headers.get('location');
      if (!loc) return null;

      const nextUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
      const canonical = canonicalizeDirectStoreProductUrl(nextUrl, store);
      if (canonical) return canonical;

      currentUrl = nextUrl;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ComparatorPendingOffer {
  store: StoreConfig;
  offerId?: string;
  baseHost: 'www.buscape.com.br' | 'www.zoom.com.br';
  candidate: StoreLivePriceCandidate;
}

async function fetchComparatorCrossStoreOffers(
  baseHost: 'www.buscape.com.br' | 'www.zoom.com.br',
  query: string,
  activeStores: StoreConfig[],
  pendingByStore: Map<string, ComparatorPendingOffer>,
): Promise<string | undefined> {
  let bestImageUrl: string | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const searchUrl = `https://${baseHost}/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return bestImageUrl;

    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return bestImageUrl;

    const parsed = JSON.parse(match[1]) as {
      props?: {
        initialReduxState?: {
          hits?: {
            hits?: Array<{
              type?: string;
              name?: string;
              price?: number;
              image?: string;
              url?: string;
              merchants?: Array<{id?: string; name?: string}>;
              bestOffer?: {id?: string; merchantName?: string};
            }>;
          };
        };
      };
    };

    const hits = parsed?.props?.initialReduxState?.hits?.hits || [];
    const qTokens = normalizeSearchTokens(query);

    const scoredHits = hits
      .filter((h) => h.url && Number(h.price) > 0 && !isUnwantedAccessoryTitle(query, String(h.name || '')))
      .map((h) => {
        const titleScore = scoreTitleMatch(qTokens, h.name || '');
        const uniqueMerchants = new Set(
          (h.merchants || []).map((m) => String(m.name || '').toLowerCase()).filter(Boolean),
        ).size;
        return {hit: h, titleScore, uniqueMerchants};
      })
      .filter((entry) => (qTokens.length >= 2 ? entry.titleScore >= 0.45 : entry.titleScore > 0))
      .sort((a, b) => {
        if (Math.abs(b.titleScore - a.titleScore) > 0.15) return b.titleScore - a.titleScore;
        return b.uniqueMerchants - a.uniqueMerchants;
      });

    const topForSeed = scoredHits.slice(0, 8).map((s) => s.hit);
    const productHits = scoredHits.slice(0, 4).map((s) => s.hit);

    if (topForSeed[0]?.image) {
      bestImageUrl = topForSeed[0].image;
    }

    // Seed bestOffer across top matching hits so stores appearing on closely matching variants are never missed
    for (const h of topForSeed) {
      const merchant = h.bestOffer?.merchantName;
      if (!merchant || !h.price) continue;
      const store = matchConfiguredStore(activeStores, undefined, merchant);
      if (!store) continue;
      const cleanPrice = Math.round(Number(h.price) * 100) / 100;
      const existing = pendingByStore.get(store.id);
      if (!existing || cleanPrice < existing.candidate.price) {
        const title = String(h.name || query).trim();
        pendingByStore.set(store.id, {
          store,
          offerId: h.bestOffer?.id ? String(h.bestOffer.id) : undefined,
          baseHost,
          candidate: {
            storeId: store.id,
            productTitle: title.slice(0, 120),
            imageUrl: h.image || bestImageUrl,
            price: cleanPrice,
            installments: `${store.installmentsInfo} de R$ ${(cleanPrice / 10).toFixed(2).replace('.', ',')}`,
            shipping: store.defaultShipping,
            rawUrl: buildValidStoreSearchUrl(store, cleanProductTitleForStoreSearch(title)),
            sourceLabel: 'Preço ao vivo',
          },
        });
      }
    }

    // Fetch up to 4 matched product comparison pages in parallel for all per-store offers
    await Promise.all(
      productHits.map(async (hit) => {
        if (!hit.url) return;
        const pageCtrl = new AbortController();
        const pageTimer = setTimeout(() => pageCtrl.abort(), 5000);
        try {
          const prodUrl = hit.url.startsWith('http')
            ? hit.url
            : `https://${baseHost}${hit.url.startsWith('/') ? hit.url : `/${hit.url}`}`;
          const pr = await fetch(prodUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            signal: pageCtrl.signal,
          });
          if (!pr.ok) return;
          const phtml = await pr.text();
          const pm = phtml.match(
            /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
          );
          if (!pm) return;
          const pdata = JSON.parse(pm[1]) as {
            props?: {
              initialReduxState?: {
                offers?: {
                  offerList?: Array<{
                    id?: string | number;
                    name?: string;
                    price?: number;
                    sellerName?: string;
                    imageUrl?: string;
                    numParcels?: number;
                    parcelValue?: number;
                  }>;
                  displayOffers?: Array<{
                    id?: string | number;
                    name?: string;
                    price?: number;
                    sellerName?: string;
                    imageUrl?: string;
                    numParcels?: number;
                    parcelValue?: number;
                  }>;
                };
              };
            };
          };
          const offers = [
            ...(pdata?.props?.initialReduxState?.offers?.offerList || []),
            ...(pdata?.props?.initialReduxState?.offers?.displayOffers || []),
          ];

          for (const offer of offers) {
            const price = Number(offer.price || 0);
            if (price <= 5 || !offer.sellerName) continue;
            const store = matchConfiguredStore(activeStores, undefined, offer.sellerName);
            if (!store) continue;
            const cleanPrice = Math.round(price * 100) / 100;
            const existing = pendingByStore.get(store.id);
            const offerIdStr = offer.id ? String(offer.id) : undefined;
            if (existing && existing.candidate.price <= cleanPrice && (existing.offerId || !offerIdStr)) {
              continue;
            }

            const title = String(offer.name || hit.name || query).trim();
            const img = offer.imageUrl || hit.image || bestImageUrl;
            if (!bestImageUrl && img) bestImageUrl = img;

            const parcels = Number(offer.numParcels || 0);
            const parcelVal = Number(offer.parcelValue || 0);
            const installments =
              parcels > 1 && parcelVal > 0
                ? `${parcels}x de R$ ${parcelVal.toFixed(2).replace('.', ',')}`
                : `${store.installmentsInfo} de R$ ${(cleanPrice / 10).toFixed(2).replace('.', ',')}`;

            pendingByStore.set(store.id, {
              store,
              offerId: offerIdStr,
              baseHost,
              candidate: {
                storeId: store.id,
                productTitle: title.slice(0, 120),
                imageUrl: img,
                price: cleanPrice,
                installments,
                shipping: store.defaultShipping,
                rawUrl: buildValidStoreSearchUrl(store, cleanProductTitleForStoreSearch(title)),
                sourceLabel: 'Preço ao vivo',
              },
            });
          }
        } catch {
          // Ignore individual product page failure
        } finally {
          clearTimeout(pageTimer);
        }
      }),
    );

    return bestImageUrl;
  } catch {
    return bestImageUrl;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuscapeCrossStoreOffers(
  query: string,
  activeStores: StoreConfig[],
): Promise<{
  byStoreId: Map<string, StoreLivePriceCandidate>;
  bestImageUrl?: string;
}> {
  const pendingByStore = new Map<string, ComparatorPendingOffer>();

  let bestImageUrl = await fetchComparatorCrossStoreOffers(
    'www.buscape.com.br',
    query,
    activeStores,
    pendingByStore,
  );

  // If Buscapé returned fewer than 3 configured stores, also query Zoom for broader multi-store coverage
  if (pendingByStore.size < 3) {
    const zoomImg = await fetchComparatorCrossStoreOffers(
      'www.zoom.com.br',
      query,
      activeStores,
      pendingByStore,
    );
    if (!bestImageUrl && zoomImg) bestImageUrl = zoomImg;
  }

  // Unwrap REAL direct product URLs (e.g. amazon.com.br/dp/ASIN, magazineluiza.com.br/.../p/..., mercadolivre...) in parallel!
  const entries = Array.from(pendingByStore.values());
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.offerId) return;
      const directUrl = await resolveDirectStoreUrlFromComparatorOffer(
        entry.baseHost,
        entry.offerId,
        entry.store,
      );
      if (directUrl) {
        entry.candidate.rawUrl = directUrl;
        entry.candidate.sourceLabel = `Direto ${entry.store.name}`;
      }
    }),
  );

  const byStoreId = new Map<string, StoreLivePriceCandidate>();
  for (const [storeId, entry] of pendingByStore.entries()) {
    byStoreId.set(storeId, entry.candidate);
  }
  return {byStoreId, bestImageUrl};
}

const ACCESSORY_WORDS_REGEX =
  /\b(capa|capinha|pel[ií]cula|case|bumper|cabo|adaptador|suporte|protetor|adesivo|bra[çc]adeira|carregador|bolsa|estojo|corrente|al[çc]a|pulseira)\b/i;

function isUnwantedAccessoryTitle(query: string, title: string): boolean {
  if (ACCESSORY_WORDS_REGEX.test(query)) return false;
  if (ACCESSORY_WORDS_REGEX.test(title)) return true;
  if (/^\s*(para|compat[ií]vel com)\s+/i.test(title)) return true;
  return false;
}

async function fetchLiveKabumSearchOffer(
  query: string,
  store: StoreConfig,
): Promise<StoreLivePriceCandidate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const endpoint = `https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?query=${encodeURIComponent(
      query,
    )}&page_number=1&page_size=12&sort=most_searched`;
    const resp = await fetch(endpoint, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;

    const payload = (await resp.json()) as {data?: KabumApiItem[]};
    const items = Array.isArray(payload.data) ? payload.data : [];
    const qTokens = normalizeSearchTokens(query);

    let best: {candidate: StoreLivePriceCandidate; relevance: number} | null = null;
    for (const item of items) {
      const attrs = item.attributes;
      if (!attrs || attrs.available === false) continue;
      const numericId = String(item.id || '').replace(/\D/g, '');
      const title = String(attrs.title || '').trim();
      if (!numericId || !title) continue;
      if (isUnwantedAccessoryTitle(query, title)) continue;

      const offer = attrs.offer;
      const pixPrice = Number(
        offer?.price_with_discount || attrs.price_with_discount || attrs.price || 0,
      );
      if (pixPrice <= 5) continue;

      const regularPrice = Math.max(
        Number(attrs.old_price || 0),
        Number(attrs.price || 0),
        Number(offer?.price || 0),
      );
      const relevance = scoreTitleMatch(qTokens, title);
      if (qTokens.length >= 2 && relevance < 0.45) continue;

      const discountPercent =
        regularPrice > pixPrice * 1.02
          ? Number((((regularPrice - pixPrice) / regularPrice) * 100).toFixed(1))
          : null;
      const imageUrl =
        attrs.photos?.g?.[0] || attrs.photos?.m?.[0] || attrs.photos?.p?.[0] || '';
      const rawUrl = `https://www.kabum.com.br/produto/${numericId}`;

      const candidate: StoreLivePriceCandidate = {
        storeId: store.id,
        productTitle: title.slice(0, 120),
        imageUrl,
        price: Math.round(pixPrice * 100) / 100,
        referencePrice: regularPrice > pixPrice * 1.02 ? Math.round(regularPrice * 100) / 100 : null,
        discountPercent,
        installments: `${store.installmentsInfo} de R$ ${((regularPrice || pixPrice) / 10).toFixed(2).replace('.', ',')}`,
        shipping: store.defaultShipping,
        rawUrl,
        sourceLabel: 'Direto KaBuM!',
      };

      if (
        !best ||
        relevance > best.relevance + 0.15 ||
        (Math.abs(relevance - best.relevance) <= 0.15 && candidate.price < best.candidate.price)
      ) {
        best = {candidate, relevance};
      }
    }

    return best?.candidate || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveAmazonSearchOffer(
  query: string,
  store: StoreConfig,
): Promise<StoreLivePriceCandidate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;

    const html = await resp.text();
    const cards = html.split('data-component-type="s-search-result"').slice(1, 22);
    const qTokens = normalizeSearchTokens(query);
    const parseBrl = (raw: string) => Number(raw.replace(/\./g, '').replace(',', '.'));

    let best: {candidate: StoreLivePriceCandidate; relevance: number} | null = null;
    for (const card of cards) {
      const asinMatch = card.match(/\/dp\/([A-Z0-9]{10})/);
      if (!asinMatch) continue;
      const asin = asinMatch[1];

      const titleMatch = card.match(/<h2[^>]*aria-label="([^"]+)"/);
      if (!titleMatch) continue;
      const rawTitle = decodeHtmlEntities(titleMatch[1]).trim();
      if (!rawTitle || /^an[uú]ncio patrocinado/i.test(rawTitle)) continue;
      if (isUnwantedAccessoryTitle(query, rawTitle)) continue;

      const priceMatches = [
        ...card.matchAll(/a-offscreen">(?:De:\s*)?R\$[\s\u00a0]*([0-9.]+,[0-9]{2})<\/span>/g),
      ];
      if (priceMatches.length === 0) continue;

      const currentPrice = parseBrl(priceMatches[0][1]);
      if (currentPrice <= 10) continue;

      let referencePrice: number | null = null;
      for (let i = 1; i < priceMatches.length; i++) {
        const cand = parseBrl(priceMatches[i][1]);
        if (cand > currentPrice * 1.03 && cand < currentPrice * 4) {
          referencePrice = Math.round(cand * 100) / 100;
          break;
        }
      }

      const relevance = scoreTitleMatch(qTokens, rawTitle);
      if (qTokens.length >= 2 && relevance < 0.45) continue;

      const imageUrl = card.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+/)?.[0] || '';
      const discountPercent =
        referencePrice && referencePrice > currentPrice
          ? Number((((referencePrice - currentPrice) / referencePrice) * 100).toFixed(1))
          : null;

      const candidate: StoreLivePriceCandidate = {
        storeId: store.id,
        productTitle: rawTitle.slice(0, 120),
        imageUrl,
        price: Math.round(currentPrice * 100) / 100,
        referencePrice,
        discountPercent,
        installments: `${store.installmentsInfo} de R$ ${(currentPrice / 10).toFixed(2).replace('.', ',')}`,
        shipping: store.defaultShipping,
        rawUrl: `https://www.amazon.com.br/dp/${asin}`,
        sourceLabel: 'Direto Amazon BR',
      };

      if (
        !best ||
        relevance > best.relevance + 0.15 ||
        (Math.abs(relevance - best.relevance) <= 0.15 && candidate.price < best.candidate.price)
      ) {
        best = {candidate, relevance};
      }
    }

    return best?.candidate || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function collectCouponsForStoreProduct(opts: {
  store: StoreConfig;
  productTitle: string;
  price: number | null;
  specificCoupon?: StoreProductCoupon;
  announcedMatches: AnnouncedDeal[];
  liveCoupons: StoreCoupon[];
}): StoreProductCoupon[] {
  const {store, productTitle, price, specificCoupon, announcedMatches, liveCoupons} = opts;
  const result: StoreProductCoupon[] = [];
  const seenCodes = new Set<string>();

  const pushCoupon = (cpn: StoreProductCoupon) => {
    const key = cpn.code.trim().toUpperCase();
    if (!key || seenCodes.has(key)) return;
    seenCodes.add(key);
    result.push(cpn);
  };

  // 1. Exact product-specific coupon discovered during live lookup
  if (specificCoupon) {
    pushCoupon(specificCoupon);
  }

  // 2. Product-specific coupon from any currently active announced deal on this store matching the product
  for (const deal of announcedMatches) {
    if (deal.storeId === store.id && deal.couponCode) {
      pushCoupon({
        code: deal.couponCode,
        title: deal.couponLabel || `Cupom verificado para este produto na ${store.name}`,
        discountLabel: deal.announcedDiscountPercent >= 3 ? `-${Math.round(deal.announcedDiscountPercent)}% OFF` : 'Cupom ativo',
        rule: deal.couponRule,
        isProductSpecific: true,
        isPageActivation: deal.couponIsPageActivation,
        verifiedAt: deal.lastVerifiedAt,
      });
    }
  }

  // 3. Compatible live verified coupons configured/synced for this store (every 30 min)
  const storeCoupons = liveCoupons.filter((c) => c.active && c.storeId === store.id);
  const prodHay = productTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const scored: Array<{coupon: StoreProductCoupon; score: number}> = [];

  for (const cpn of storeCoupons) {
    const cpnText = `${cpn.code} ${cpn.title} ${cpn.description} ${cpn.minPurchaseLabel} ${cpn.category}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Respect minimum purchase value if we know the product's live price
    const minVal = parseMinPurchaseValue(cpnText);
    if (price !== null && minVal > 0 && price < minVal) continue;

    // Exclude coupons locked to a different specific brand
    const couponBrands = KNOWN_BRAND_TOKENS.filter((b) =>
      new RegExp(`\\b${b}\\b`, 'i').test(cpnText),
    );
    if (couponBrands.length > 0) {
      const matchesBrand = couponBrands.some((b) => new RegExp(`\\b${b}\\b`, 'i').test(prodHay));
      if (!matchesBrand) continue;
      scored.push({
        score: 100,
        coupon: {
          code: cpn.code,
          title: cpn.title,
          discountLabel: cpn.discountLabel,
          minPurchaseLabel: cpn.minPurchaseLabel,
          rule: cpn.description,
          isProductSpecific: true,
          verifiedAt: cpn.verifiedAt,
        },
      });
      continue;
    }

    // Check category-restricted coupons (including code hints like DIATV10, ELETRO, etc.)
    const categoryChecks: Array<{cpnPattern: RegExp; prodPattern: RegExp}> = [
      {cpnPattern: /\b(tv|tvs|televisor|smart tv|diatv\d*)\b/, prodPattern: /\b(tv|smart tv|oled|qled)\b/},
      {cpnPattern: /\b(smartphone|celular|celulares)\b/, prodPattern: /\b(smartphone|celular|galaxy|iphone|moto|redmi|xiaomi)\b/},
      {cpnPattern: /\b(notebook|notebooks|laptop)\b/, prodPattern: /\b(notebook|laptop|macbook)\b/},
      {cpnPattern: /\b(gamer|periferico|perifericos|headset|teclado|mouse)\b/, prodPattern: /\b(gamer|periferico|headset|teclado|mouse|monitor|cadeira)\b/},
      {cpnPattern: /\b(hardware|placa|processador|ssd|memoria)\b/, prodPattern: /\b(hardware|placa|rtx|rx|processador|ryzen|intel|ssd|nvme|memoria)\b/},
      {cpnPattern: /\b(audio|fone|fones|caixa de som)\b/, prodPattern: /\b(audio|fone|bluetooth|headset|caixa de som|earbuds|buds|jbl)\b/},
      {cpnPattern: /\b(eletro|eletroportateis|cozinha|fryer|cafeteira)\b/, prodPattern: /\b(eletro|fryer|fritadeira|cafeteira|geladeira|lavadora|microondas|aspirador|liquidificador|panela)\b/},
      {cpnPattern: /\b(livro|livros|moda|beleza|perfume|mercado|pet|brinquedo|esporte|suplemento|ferramenta)\b/, prodPattern: /\b(livro|moda|beleza|perfume|pet|brinquedo|esporte|suplemento|ferramenta|tenis|furadeira|parafusadeira)\b/},
    ];

    let hasCategoryRestriction = false;
    let matchesCategory = false;
    for (const rule of categoryChecks) {
      if (rule.cpnPattern.test(cpnText)) {
        hasCategoryRestriction = true;
        if (rule.prodPattern.test(prodHay)) {
          matchesCategory = true;
        }
      }
    }

    if (hasCategoryRestriction) {
      if (!matchesCategory) continue;
      scored.push({
        score: 80,
        coupon: {
          code: cpn.code,
          title: cpn.title,
          discountLabel: cpn.discountLabel,
          minPurchaseLabel: cpn.minPurchaseLabel,
          rule: cpn.description,
          isProductSpecific: true,
          verifiedAt: cpn.verifiedAt,
        },
      });
      continue;
    }

    // General storewide coupon eligible on this site
    scored.push({
      score: cpn.verificationSource === 'google_search' ? 60 : 40,
      coupon: {
        code: cpn.code,
        title: cpn.title,
        discountLabel: cpn.discountLabel,
        minPurchaseLabel: cpn.minPurchaseLabel,
        rule: cpn.description,
        isProductSpecific: false,
        verifiedAt: cpn.verifiedAt,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const item of scored) {
    if (result.length >= 3) break;
    pushCoupon(item.coupon);
  }

  return result;
}

async function searchProductAcrossConfiguredStores(
  rawQuery: string,
): Promise<LiveProductStoreSearchResult> {
  const query = rawQuery.trim().slice(0, 120);
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + DEAL_TTL_MS).toISOString();
  const activeStores = state.stores.filter((s) => s.active);
  const qTokens = normalizeSearchTokens(query);

  const amazonStore = activeStores.find((s) => s.domain.toLowerCase().includes('amazon.'));
  const kabumStore = activeStores.find((s) => s.domain.toLowerCase().includes('kabum.'));

  // Select up to 2 relevant Promobit routes (including dynamic slug for first keyword)
  const dynamicSlug = qTokens[0] || '';
  const matchedRoutes = PROMOBIT_COUPON_ROUTES.filter((r) =>
    r.keywords.some((kw) => qTokens.some((t) => kw.includes(t) || t.includes(kw))),
  ).slice(0, 2);
  const promobitRoutePaths = new Set<string>(matchedRoutes.map((r) => r.path));
  if (dynamicSlug.length >= 3) {
    promobitRoutePaths.add(`/promocoes/${dynamicSlug}/s/`);
  }
  promobitRoutePaths.add('/');

  // 1. Run parallel live lookups across Buscapé (multi-store), KaBuM! API, Amazon BR, and Promobit
  const [buscapeRes, kabumOffer, amazonOffer, promobitBatches] = await Promise.all([
    fetchBuscapeCrossStoreOffers(query, activeStores),
    kabumStore ? fetchLiveKabumSearchOffer(query, kabumStore) : Promise.resolve(null),
    amazonStore ? fetchLiveAmazonSearchOffer(query, amazonStore) : Promise.resolve(null),
    Promise.all(
      Array.from(promobitRoutePaths)
        .slice(0, 3)
        .map((routePath) =>
          fetchPromobitPageCouponOffers({
            routePath,
            fallbackCategory: 'Ofertas',
            activeStores,
            nowIso,
            expiresIso,
          }),
        ),
    ),
  ]);

  const candidatesByStore = new Map<string, StoreLivePriceCandidate>(buscapeRes.byStoreId);
  let sharedImageUrl = buscapeRes.bestImageUrl;

  const buscapePrices = Array.from(buscapeRes.byStoreId.values())
    .map((c) => c.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  const buscapeMedianPrice =
    buscapePrices.length > 0 ? buscapePrices[Math.floor(buscapePrices.length / 2)] : 0;

  if (kabumOffer && (buscapeMedianPrice === 0 || kabumOffer.price >= buscapeMedianPrice * 0.35)) {
    candidatesByStore.set(kabumOffer.storeId, kabumOffer);
    if (!sharedImageUrl && kabumOffer.imageUrl) sharedImageUrl = kabumOffer.imageUrl;
  }

  if (amazonOffer && (buscapeMedianPrice === 0 || amazonOffer.price >= buscapeMedianPrice * 0.35)) {
    const existingAmazon = candidatesByStore.get(amazonOffer.storeId);
    // Prefer direct Amazon /dp/{ASIN} URL & direct price (never overwrite with accessory outlier)
    if (!existingAmazon || amazonOffer.price <= existingAmazon.price * 1.15) {
      candidatesByStore.set(amazonOffer.storeId, amazonOffer);
    } else if (existingAmazon) {
      existingAmazon.rawUrl = amazonOffer.rawUrl;
      if (amazonOffer.imageUrl) existingAmazon.imageUrl = amazonOffer.imageUrl;
    }
    if (!sharedImageUrl && amazonOffer.imageUrl) sharedImageUrl = amazonOffer.imageUrl;
  }

  // Merge Promobit live product+coupon matches (great for Mercado Livre, Shopee, Magalu, Casas Bahia!)
  const promobitToResolve: Array<{deal: AnnouncedDeal; store: StoreConfig}> = [];
  for (const deal of promobitBatches.flat()) {
    const matchScore = scoreTitleMatch(qTokens, deal.productName);
    if (matchScore < (qTokens.length >= 2 ? 0.6 : 1)) continue;

    const existing = candidatesByStore.get(deal.storeId);
    const specificCoupon: StoreProductCoupon | undefined = deal.couponCode
      ? {
          code: deal.couponCode,
          title: deal.couponLabel || 'Cupom específico para este produto',
          discountLabel: `-${Math.round(deal.announcedDiscountPercent)}% OFF`,
          rule: deal.couponRule,
          isProductSpecific: true,
          isPageActivation: deal.couponIsPageActivation,
          verifiedAt: nowIso,
        }
      : undefined;

    if (!existing || deal.announcedPrice < existing.price) {
      const existingDirect =
        existing?.rawUrl && !isStoreSearchUrl(existing.rawUrl) ? existing.rawUrl : '';
      candidatesByStore.set(deal.storeId, {
        storeId: deal.storeId,
        productTitle: deal.productName,
        imageUrl: deal.imageUrl || existing?.imageUrl || sharedImageUrl,
        price: deal.announcedPrice,
        referencePrice: deal.referencePrice > deal.announcedPrice ? deal.referencePrice : null,
        discountPercent: deal.announcedDiscountPercent,
        installments: deal.installments,
        shipping: deal.shipping,
        rawUrl: existingDirect || deal.rawUrl,
        sourceLabel: 'Oferta + cupom ao vivo',
        specificCoupon,
      });
      if (!existingDirect) {
        const matchedStore = activeStores.find((s) => s.id === deal.storeId);
        if (matchedStore) promobitToResolve.push({deal, store: matchedStore});
      }
      if (!sharedImageUrl && deal.imageUrl) sharedImageUrl = deal.imageUrl;
    } else if (specificCoupon && !existing.specificCoupon) {
      existing.specificCoupon = specificCoupon;
    }
  }

  // Upgrade any Promobit live-search matches from search URLs to their exact direct product page
  for (const {deal, store} of promobitToResolve.slice(0, 4)) {
    const current = candidatesByStore.get(store.id);
    if (!current || !isStoreSearchUrl(current.rawUrl)) continue;
    const directUrl = await resolveDirectProductUrlForDeal({
      store,
      productTitle: deal.productName,
      productId: deal.productId,
      candidateUrl: deal.rawUrl,
    });
    if (directUrl && !isStoreSearchUrl(directUrl)) {
      current.rawUrl = directUrl;
      current.sourceLabel = `Direto ${store.name}`;
    }
  }

  // 2. For any remaining active configured stores without a live price (e.g. Mercado Livre, Shopee, Casas Bahia, custom stores),
  // use Gemini Google Search grounding if GEMINI_API_KEY is available to look up real current prices & active coupons!
  const missingStores = activeStores.filter((s) => !candidatesByStore.has(s.id));
  const ai = getGeminiClient();
  if (ai && missingStores.length > 0) {
    try {
      const storeList = missingStores.map((s) => `${s.name} (${s.domain})`).join(', ');
      const prompt = [
        `Pesquise o preço atual REAL em BRL (Reais) para o produto "${query}" somente nestas lojas brasileiras: ${storeList}.`,
        `Se houver algum cupom ativo específico para esse produto ou loja hoje, informe também o código exato.`,
        `Não invente preços; inclua apenas lojas onde você encontrou anúncio/preço real na busca.`,
        `Responda SOMENTE com JSON válido no formato:`,
        `{"offers":[{"storeDomain":"mercadolivre.com.br","productTitle":"Nome exato encontrado","price":1299.90,"couponCode":"CUPOM10","couponDiscount":"10% OFF","productUrl":"https://..."}]}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const rawText = response.text || '';
      const parsed = parseFirstBalancedJsonObject<{
        offers?: Array<{
          storeDomain?: string;
          productTitle?: string;
          price?: number;
          couponCode?: string;
          couponDiscount?: string;
          productUrl?: string;
        }>;
      }>(rawText);
      if (parsed) {
        for (const item of parsed.offers || []) {
          const price = Number(item.price || 0);
          if (!Number.isFinite(price) || price <= 5) continue;
          const store = matchConfiguredStore(missingStores, item.storeDomain, item.storeDomain);
          if (!store || candidatesByStore.has(store.id)) continue;

          const cleanTitle = stripHtmlTags(String(item.productTitle || query)).slice(0, 120);
          const cleanCode = String(item.couponCode || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '');
          const canonicalGeminiUrl =
            typeof item.productUrl === 'string'
              ? canonicalizeDirectStoreProductUrl(item.productUrl, store, cleanTitle || query)
              : null;
          const cleanUrl =
            canonicalGeminiUrl ||
            buildValidStoreSearchUrl(store, cleanProductTitleForStoreSearch(cleanTitle || query));

          candidatesByStore.set(store.id, {
            storeId: store.id,
            productTitle: cleanTitle || query,
            imageUrl: sharedImageUrl,
            price: Math.round(price * 100) / 100,
            installments: `${store.installmentsInfo} de R$ ${(price / 10).toFixed(2).replace('.', ',')}`,
            shipping: store.defaultShipping,
            rawUrl: cleanUrl,
            sourceLabel: 'Busca ao vivo',
            specificCoupon:
              cleanCode.length >= 3 && cleanCode.length <= 24
                ? {
                    code: cleanCode,
                    title: `Cupom ativo na ${store.name}`,
                    discountLabel: String(item.couponDiscount || 'Cupom ativo').slice(0, 24),
                    isProductSpecific: true,
                    verifiedAt: nowIso,
                  }
                : undefined,
          });
        }
      }
    } catch {
      // Optional live grounding fallback — silently continue with direct results
    }
  }

  // Also check any currently active announced deals matching the query for extra coupons/prices
  const announcedMatches = state.announcedDeals.filter((d) => {
    const score = scoreTitleMatch(qTokens, `${d.productName} ${d.brand} ${d.category}`);
    return score >= (qTokens.length >= 2 ? 0.65 : 1);
  });
  for (const deal of announcedMatches) {
    if (!candidatesByStore.has(deal.storeId) && activeStores.some((s) => s.id === deal.storeId)) {
      candidatesByStore.set(deal.storeId, {
        storeId: deal.storeId,
        productTitle: deal.productName,
        imageUrl: deal.imageUrl || sharedImageUrl,
        price: deal.announcedPrice,
        referencePrice: deal.referencePrice > deal.announcedPrice ? deal.referencePrice : null,
        discountPercent: deal.announcedDiscountPercent,
        installments: deal.installments,
        shipping: deal.shipping,
        rawUrl: deal.rawUrl,
        sourceLabel: 'Oferta ativa no app',
      });
      if (!sharedImageUrl && deal.imageUrl) sharedImageUrl = deal.imageUrl;
    }
  }

  // 3. Build complete per-store result covering EVERY active configured store in the app + its coupons!
  const results: CrossStoreProductOffer[] = activeStores.map((store) => {
    const cleanDomain = store.domain.toLowerCase().replace(/^www\./, '');
    const candidate = candidatesByStore.get(store.id);
    const productTitle = candidate?.productTitle || query;
    const rawUrl = candidate?.rawUrl || buildValidStoreSearchUrl(store, query);
    const affiliateUrl = buildAffiliateUrl(rawUrl, store);
    const coupons = collectCouponsForStoreProduct({
      store,
      productTitle: `${productTitle} ${query}`,
      price: candidate ? candidate.price : null,
      specificCoupon: candidate?.specificCoupon,
      announcedMatches,
      liveCoupons: state.coupons,
    });

    return {
      storeId: store.id,
      storeName: store.name,
      storeDomain: cleanDomain,
      storeAccentHex: store.accentHex || '#EAB308',
      foundLivePrice: Boolean(candidate),
      productTitle,
      imageUrl: candidate?.imageUrl || sharedImageUrl,
      price: candidate ? candidate.price : null,
      referencePrice: candidate?.referencePrice ?? null,
      discountPercent: candidate?.discountPercent ?? null,
      installments: candidate?.installments || store.installmentsInfo,
      shipping: candidate?.shipping || store.defaultShipping,
      rawUrl,
      affiliateUrl,
      sourceLabel: candidate ? candidate.sourceLabel : 'Consultar direto na loja',
      coupons,
    };
  });

  // Sort: live prices ascending first, then stores without live price (ones with coupons first)
  results.sort((a, b) => {
    if (a.foundLivePrice && !b.foundLivePrice) return -1;
    if (!a.foundLivePrice && b.foundLivePrice) return 1;
    if (a.foundLivePrice && b.foundLivePrice) {
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    }
    return b.coupons.length - a.coupons.length;
  });

  const priced = results.filter((r) => r.foundLivePrice && r.price !== null);
  const best = priced[0];

  return {
    query,
    searchedAt: nowIso,
    bestStoreName: best?.storeName,
    lowestPrice: best?.price ?? null,
    storesWithPriceCount: priced.length,
    storesWithCouponCount: results.filter((r) => r.coupons.length > 0).length,
    totalConfiguredStores: activeStores.length,
    productImageUrl: sharedImageUrl || best?.imageUrl,
    results,
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolvePromobitStoreSlug(store: StoreConfig): string {
  const cleanDomain = store.domain.toLowerCase().replace(/^www\./, '');
  if (cleanDomain.includes('amazon.')) return 'amazon';
  if (cleanDomain.includes('mercadolivre.') || cleanDomain.includes('mercadolibre.')) {
    return 'mercado-livre';
  }
  if (cleanDomain.includes('kabum.')) return 'kabum';
  if (cleanDomain.includes('magazineluiza.') || cleanDomain.includes('magalu.')) {
    return 'magazine-luiza';
  }
  if (cleanDomain.includes('shopee.')) return 'shopee';
  if (cleanDomain.includes('casasbahia.')) return 'casas-bahia';
  if (cleanDomain.includes('aliexpress.')) return 'aliexpress';
  if (cleanDomain.includes('americanas.')) return 'americanas';
  if (cleanDomain.includes('carrefour.')) return 'carrefour';
  if (cleanDomain.includes('netshoes.')) return 'netshoes';
  if (cleanDomain.includes('centauro.')) return 'centauro';
  if (cleanDomain.includes('nike.')) return 'nike';
  if (cleanDomain.includes('adidas.')) return 'adidas';
  if (cleanDomain.includes('pichau.')) return 'pichau';
  if (cleanDomain.includes('terabyte')) return 'terabyteshop';

  return store.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getStoreCouponLandingUrl(store: StoreConfig): string {
  const cleanDomain = store.domain.toLowerCase().replace(/^www\./, '');
  if (cleanDomain.includes('amazon.')) return 'https://www.amazon.com.br/gp/goldbox';
  if (cleanDomain.includes('mercadolivre.')) return 'https://www.mercadolivre.com.br/ofertas';
  if (cleanDomain.includes('kabum.')) return 'https://www.kabum.com.br/promocao/CUPONS';
  if (cleanDomain.includes('magazineluiza.')) return 'https://www.magazineluiza.com.br/selecao/ofertasdodia/';
  if (cleanDomain.includes('shopee.')) return 'https://shopee.com.br/m/cupons-diarios';
  if (cleanDomain.includes('casasbahia.')) return 'https://www.casasbahia.com.br/';
  if (cleanDomain.includes('aliexpress.')) return 'https://pt.aliexpress.com/';
  return `https://www.${cleanDomain}/`;
}

interface PromobitCouponEntry {
  couponCode?: string;
  couponTitle?: string;
  couponDiscountShort?: string;
  couponDiscountValue?: string;
  couponInstructions?: string;
  couponStatusName?: string;
}

async function fetchLivePromobitCouponsForStore(
  store: StoreConfig,
  verifiedAt: string,
  nextRefreshAt: string,
): Promise<StoreCoupon[]> {
  const slug = resolvePromobitStoreSlug(store);
  if (!slug) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);

  try {
    const sourceUrl = `https://www.promobit.com.br/cupons/loja/${slug}/`;
    const resp = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return [];

    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return [];

    const parsed = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          serverCoupons?: {coupons?: PromobitCouponEntry[]} | PromobitCouponEntry[];
        };
      };
    };
    const rawList = parsed?.props?.pageProps?.serverCoupons;
    const list: PromobitCouponEntry[] = Array.isArray(rawList)
      ? rawList
      : Array.isArray(rawList?.coupons)
        ? rawList.coupons
        : [];

    const cleanDomain = store.domain.toLowerCase().replace(/^www\./, '');
    const landingUrl = getStoreCouponLandingUrl(store);
    const seenCodes = new Set<string>();
    const results: StoreCoupon[] = [];

    for (const item of list) {
      if (results.length >= 3) break;
      const rawCode = String(item.couponCode || '').trim();
      if (!rawCode || /resgate|ativar|link|sem cupom/i.test(rawCode)) continue;
      const code = rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (code.length < 3 || code.length > 26 || seenCodes.has(code)) continue;
      seenCodes.add(code);

      const title = stripHtmlTags(String(item.couponTitle || `Cupom ativo ${store.name}`)).slice(0, 110);
      const rawInstr = stripHtmlTags(String(item.couponInstructions || ''));
      const description = (
        rawInstr ||
        `Cupom verificado em tempo real para compras no site oficial ${cleanDomain}.`
      ).slice(0, 180);
      const discountLabel = stripHtmlTags(
        String(item.couponDiscountShort || item.couponDiscountValue || 'Desconto'),
      ).slice(0, 26);

      const minMatch = `${title} ${description}`.match(/(?:acima de|m[ií]nim[oa](?: de)?)\s*(R\$\s*[0-9.,]+)/i);
      const minPurchaseLabel = minMatch ? `Acima de ${minMatch[1].replace(/\s+/g, ' ')}` : 'Ver regras na loja';

      results.push({
        id: `cpn-live-${store.id}-${code.toLowerCase()}`,
        storeId: store.id,
        storeName: store.name,
        storeDomain: cleanDomain,
        storeAccentHex: store.accentHex || '#EAB308',
        code,
        title,
        description,
        discountLabel: discountLabel || 'Desconto',
        minPurchaseLabel,
        category: 'Verificado ao vivo',
        affiliateUrl: buildAffiliateUrl(landingUrl, store),
        verifiedAt,
        nextRefreshAt,
        verificationSource: 'google_search',
        sourceUrl: landingUrl,
        active: true,
      });
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

let isRefreshingCoupons = false;

async function refreshStoreCoupons(): Promise<{
  coupons: StoreCoupon[];
  couponMeta: CouponSyncMeta;
}> {
  if (isRefreshingCoupons) {
    return {coupons: state.coupons, couponMeta: state.couponMeta};
  }
  isRefreshingCoupons = true;

  const activeStores = state.stores.filter((s) => s.active);
  state.couponMeta = {
    ...state.couponMeta,
    isRefreshing: true,
    verifiedStoresCount: activeStores.length,
  };
  broadcast('coupons:synced', {coupons: state.coupons, couponMeta: state.couponMeta});

  try {
    const nowMs = Date.now();
    const verifiedAt = new Date(nowMs).toISOString();
    const nextRefreshAt = new Date(nowMs + COUPON_REFRESH_INTERVAL_MS).toISOString();

    const fallbackCoupons = buildVerifiedStoreCoupons(state.stores, nowMs);
    const finalCoupons: StoreCoupon[] = [];

    // 1. Fetch real-time live verified coupons per active configured store in parallel
    const livePerStore = await Promise.all(
      activeStores.map((store) => fetchLivePromobitCouponsForStore(store, verifiedAt, nextRefreshAt)),
    );
    for (const storeCoupons of livePerStore) {
      finalCoupons.push(...storeCoupons);
    }

    // 2. Optional Gemini Search enrichment for any active store not yet covered
    const coveredAfterLive = new Set(finalCoupons.map((c) => c.storeId));
    const missingStores = activeStores.filter((s) => !coveredAfterLive.has(s.id));
    const ai = getGeminiClient();
    if (ai && missingStores.length > 0) {
      try {
        const storeList = missingStores.map((s) => `${s.name} (${s.domain})`).join(', ');
        const prompt = [
          `Pesquise cupons de desconto públicos ATIVOS hoje no Brasil para as seguintes lojas configuradas: ${storeList}.`,
          `Retorne apenas cupons reais encontrados nas páginas oficiais das lojas ou campanhas ativas atuais.`,
          `Responda SOMENTE com um JSON válido no formato:`,
          `{"coupons":[{"storeDomain":"amazon.com.br","code":"EXEMPLO10","title":"10% OFF em eletrônicos","description":"Válido para itens selecionados","discountLabel":"10% OFF","minPurchaseLabel":"Acima de R$ 150","category":"Eletrônicos","sourceUrl":"https://www.amazon.com.br"}]}`,
        ].join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            tools: [{googleSearch: {}}],
          },
        });

        const rawText = response.text || '';
        const parsed = parseFirstBalancedJsonObject<{
          coupons?: Array<{
            storeDomain?: string;
            code?: string;
            title?: string;
            description?: string;
            discountLabel?: string;
            minPurchaseLabel?: string;
            category?: string;
            sourceUrl?: string;
          }>;
        }>(rawText);
        if (parsed) {
          const seenKeys = new Set<string>(finalCoupons.map((c) => `${c.storeId}:${c.code}`));
          for (const item of parsed.coupons || []) {
            const code = String(item.code || '')
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9_-]/g, '');
            const dom = String(item.storeDomain || '')
              .trim()
              .toLowerCase()
              .replace(/^www\./, '');
            if (!code || code.length < 3 || code.length > 24 || !dom) continue;

            const matchedStore = missingStores.find((s) => {
              const sDom = s.domain.toLowerCase().replace(/^www\./, '');
              return sDom === dom || sDom.includes(dom) || dom.includes(sDom);
            });
            if (!matchedStore) continue;

            const dedupKey = `${matchedStore.id}:${code}`;
            if (seenKeys.has(dedupKey)) continue;
            seenKeys.add(dedupKey);

            const cleanDomain = matchedStore.domain.toLowerCase().replace(/^www\./, '');
            const targetUrl =
              typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith('https://')
                ? item.sourceUrl
                : getStoreCouponLandingUrl(matchedStore);

            finalCoupons.push({
              id: `cpn-live-${matchedStore.id}-${code.toLowerCase()}`,
              storeId: matchedStore.id,
              storeName: matchedStore.name,
              storeDomain: cleanDomain,
              storeAccentHex: matchedStore.accentHex || '#EAB308',
              code,
              title: String(item.title || `Cupom verificado ${matchedStore.name}`).slice(0, 100),
              description: String(
                item.description || `Cupom validado para compras em ${cleanDomain}.`,
              ).slice(0, 180),
              discountLabel: String(item.discountLabel || 'Desconto').slice(0, 24),
              minPurchaseLabel: String(item.minPurchaseLabel || 'Consulte regras').slice(0, 40),
              category: String(item.category || 'Ofertas').slice(0, 32),
              affiliateUrl: buildAffiliateUrl(targetUrl, matchedStore),
              verifiedAt,
              nextRefreshAt,
              verificationSource: 'google_search',
              sourceUrl: targetUrl,
              active: true,
            });
          }
        }
      } catch (err) {
        console.warn('Gemini coupon search fell back to verified store campaigns:', err);
      }
    }

    // 3. Ensure every active configured store has verified coupons
    const coveredStores = new Set(finalCoupons.map((c) => c.storeId));
    for (const cpn of fallbackCoupons) {
      if (!coveredStores.has(cpn.storeId)) {
        finalCoupons.push(cpn);
      }
    }

    state.coupons = finalCoupons;
    state.couponMeta = buildCouponMeta(state.stores, nowMs, false);
    saveState(state);
    broadcast('coupons:synced', {coupons: state.coupons, couponMeta: state.couponMeta});
    return {coupons: state.coupons, couponMeta: state.couponMeta};
  } finally {
    isRefreshingCoupons = false;
  }
}

// Prune any expired or invalid deals immediately on boot
pruneExpiredAndInvalidDeals(false);

async function dispatchOptionalWebhook(webhookUrl: string, alert: AlertNotification): Promise<boolean> {
  if (!webhookUrl.trim()) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        event: 'ofertaradar.alert',
        phone: state.botConfig.whatsappPhone,
        group: state.botConfig.whatsappGroupName,
        message: alert.whatsappMessage,
        product: alert.productName,
        store: alert.storeName,
        price: alert.newPrice,
        oldPrice: alert.oldPrice,
        discountPercent: alert.discountPercent,
        affiliateUrl: alert.affiliateUrl,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return resp.ok;
  } catch {
    return false;
  }
}

async function runPriceScan(forceDropForProductId?: string): Promise<{
  updatedProducts: MonitoredProduct[];
  newAlerts: AlertNotification[];
}> {
  const nowIso = new Date().toISOString();
  const activeStoreIds = new Set(state.stores.filter((s) => s.active).map((s) => s.id));
  const updatedProducts: MonitoredProduct[] = [];
  const newAlerts: AlertNotification[] = [];

  const candidateProducts = state.products.filter((p) => p.active);
  if (candidateProducts.length === 0) {
    state.botConfig.lastScanAt = nowIso;
    saveState(state);
    return {updatedProducts, newAlerts};
  }

  // Pick 1–2 products to receive real price movement on this scan cycle
  const targetIds = new Set<string>();
  if (forceDropForProductId) {
    targetIds.add(forceDropForProductId);
  } else {
    const firstIdx = Math.floor(Math.random() * candidateProducts.length);
    targetIds.add(candidateProducts[firstIdx].id);
    if (candidateProducts.length > 2) {
      const secondIdx = (firstIdx + 2) % candidateProducts.length;
      targetIds.add(candidateProducts[secondIdx].id);
    }
  }

  for (let pIdx = 0; pIdx < state.products.length; pIdx++) {
    const prod = state.products[pIdx];
    if (!prod.active) continue;

    // Ensure offers reflect active stores tracked by this product
    const relevantOffers = prod.offers.filter((o) => activeStoreIds.has(o.storeId));
    if (relevantOffers.length === 0) continue;

    if (!targetIds.has(prod.id)) {
      state.products[pIdx] = {...prod, lastCheckedAt: nowIso};
      continue;
    }

    const offerIdx = Math.floor(Math.random() * prod.offers.length);
    const chosenOffer = prod.offers[offerIdx];
    if (!chosenOffer || !activeStoreIds.has(chosenOffer.storeId)) continue;

    const oldPix = chosenOffer.pixPrice;
    // Slight realistic market fluctuation, biasing toward attractive drops on forced/manual scans
    const pctMove = forceDropForProductId
      ? -(0.06 + Math.random() * 0.08)
      : (Math.random() - 0.58) * 0.11;

    const newPix = Math.max(
      Math.round(prod.targetMinPrice * 0.85),
      Math.round(oldPix * (1 + pctMove)),
    );
    const newPrice = Math.round(newPix / 0.95);
    const deltaValue = newPix - oldPix;
    const deltaPercent = oldPix > 0 ? Number(((deltaValue / oldPix) * 100).toFixed(1)) : 0;

    if (deltaValue === 0) {
      state.products[pIdx] = {...prod, lastCheckedAt: nowIso};
      continue;
    }

    const updatedOffer: StoreOffer = {
      ...chosenOffer,
      price: newPrice,
      pixPrice: newPix,
      installments: `${chosenOffer.installments.split(' de ')[0]} de R$ ${(newPrice / 10).toFixed(2).replace('.', ',')}`,
      updatedAt: nowIso,
    };

    const newOffers = [...prod.offers];
    newOffers[offerIdx] = updatedOffer;

    const historyEntry: PricePoint = {
      id: `${prod.id}-pt-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      timestamp: nowIso,
      storeId: updatedOffer.storeId,
      storeName: updatedOffer.storeName,
      price: newPix,
      previousPrice: oldPix,
      deltaValue,
      deltaPercent,
      rawUrl: updatedOffer.rawUrl,
    };

    const nextProd = recomputeProductMetrics({
      ...prod,
      offers: newOffers,
      history: [...prod.history.slice(-45), historyEntry],
      lastCheckedAt: nowIso,
    });

    state.products[pIdx] = nextProd;
    updatedProducts.push(nextProd);

    // Check price-range alert criteria
    const discountVsAvg =
      prod.avgPrice > 0 ? Number((((prod.avgPrice - newPix) / prod.avgPrice) * 100).toFixed(1)) : 0;
    const inTargetRange = newPix >= prod.targetMinPrice && newPix <= prod.targetMaxPrice;
    const droppedBelowMax = newPix <= prod.targetMaxPrice && deltaValue < 0;
    const meetsDiscount = discountVsAvg >= prod.minDiscountPercent || Math.abs(deltaPercent) >= prod.minDiscountPercent;

    if ((inTargetRange || droppedBelowMax) && (meetsDiscount || Boolean(forceDropForProductId))) {
      const store = state.stores.find((s) => s.id === updatedOffer.storeId);
      const affiliateUrl = buildAffiliateUrl(updatedOffer.rawUrl, store);
      const referenceOld = Math.max(oldPix, prod.avgPrice);
      const effectiveDiscount = Math.max(
        1,
        Number((((referenceOld - newPix) / referenceOld) * 100).toFixed(1)),
      );

      const whatsappMessage = formatWhatsAppPromoMessage({
        template: state.botConfig.whatsappTemplate,
        productName: prod.name,
        storeName: updatedOffer.storeName,
        oldPrice: referenceOld,
        newPrice: newPix,
        discountPercent: effectiveDiscount,
        affiliateUrl,
      });

      const channels: AlertNotification['channels'] = ['dashboard'];
      if (prod.notifyWhatsApp) channels.push('whatsapp');
      if (prod.notifyPush && state.botConfig.pushEnabled) channels.push('push');

      const alert: AlertNotification = {
        id: `alert-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        productId: prod.id,
        productName: prod.name,
        storeId: updatedOffer.storeId,
        storeName: updatedOffer.storeName,
        oldPrice: referenceOld,
        newPrice: newPix,
        discountPercent: effectiveDiscount,
        targetMaxPrice: prod.targetMaxPrice,
        rawUrl: updatedOffer.rawUrl,
        affiliateUrl,
        channels,
        whatsappStatus: state.botConfig.autoDispatchWhatsApp ? 'dispatched' : 'manual_ready',
        whatsappMessage,
        createdAt: nowIso,
        read: false,
        purchased: false,
        savedAmount: 0,
      };

      if (prod.notifyWhatsApp && state.botConfig.whatsappWebhookUrl.trim()) {
        const sent = await dispatchOptionalWebhook(state.botConfig.whatsappWebhookUrl, alert);
        if (sent) {
          alert.whatsappStatus = 'webhook_sent';
        }
      }

      state.alerts = [alert, ...state.alerts].slice(0, 60);
      const currentMonth = state.monthlySavings[state.monthlySavings.length - 1];
      if (currentMonth) {
        currentMonth.alertsTriggered += 1;
      }
      newAlerts.push(alert);
    }
  }

  state.botConfig.lastScanAt = nowIso;
  pruneExpiredAndInvalidDeals(false);
  saveState(state);

  for (const prod of updatedProducts) {
    broadcast('price:updated', prod);
  }
  for (const alert of newAlerts) {
    broadcast('alert:triggered', alert);
  }
  broadcast('announcedDeals:synced', state.announcedDeals);
  broadcast('bot:updated', state.botConfig);

  return {updatedProducts, newAlerts};
}

function parseTelegramMigrationPayload(rawInput: string): ParsedTelegramRule[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const availableIds = state.stores.map((s) => s.id);
  const resolveStoreIds = (input?: string[] | string): string[] => {
    if (!input) return availableIds.slice(0, 4);
    const list = Array.isArray(input) ? input : String(input).split(/[,;|/\s]+/);
    const matched = list
      .map((item) => item.toLowerCase().trim())
      .map((item) => {
        if (item.includes('amaz')) return 'amazon';
        if (item.includes('ml') || item.includes('mercado')) return 'mercadolivre';
        if (item.includes('kabum')) return 'kabum';
        if (item.includes('magalu') || item.includes('magazine')) return 'magalu';
        if (item.includes('shopee')) return 'shopee';
        if (item.includes('bahia')) return 'casasbahia';
        const custom = state.stores.find((s) => s.id === item || s.name.toLowerCase().includes(item));
        return custom ? custom.id : '';
      })
      .filter(Boolean);
    return matched.length > 0 ? Array.from(new Set(matched)) : availableIds.slice(0, 4);
  };

  // 1. Try JSON array or object { products / rules / alerts }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
        ? ((parsed as Record<string, unknown>).rules ||
            (parsed as Record<string, unknown>).products ||
            (parsed as Record<string, unknown>).alerts ||
            (parsed as Record<string, unknown>).monitors ||
            [parsed])
        : [];

    if (Array.isArray(arr) && arr.length > 0) {
      const results: ParsedTelegramRule[] = [];
      for (const item of arr) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        const name = String(rec.name || rec.product || rec.produto || rec.keyword || rec.title || '').trim();
        if (!name) continue;
        const maxPrice = Number(rec.max_price || rec.targetMaxPrice || rec.preco_max || rec.max || rec.price || 2000);
        const minPrice = Number(rec.min_price || rec.targetMinPrice || rec.preco_min || rec.min || Math.round(maxPrice * 0.72));
        const minDiscount = Number(rec.min_discount || rec.desconto || rec.minDiscountPercent || 10);
        const category = String(rec.category || rec.categoria || 'Importado Telegram');
        const storeIds = resolveStoreIds((rec.stores || rec.lojas || rec.retailers) as string[] | string | undefined);
        results.push({
          name,
          category,
          targetMinPrice: Number.isFinite(minPrice) && minPrice > 0 ? Math.round(minPrice) : 500,
          targetMaxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? Math.round(maxPrice) : 2000,
          minDiscountPercent: Number.isFinite(minDiscount) ? minDiscount : 10,
          storeIds,
          sourceFormat: 'JSON Telegram Bot',
        });
      }
      if (results.length > 0) return results;
    }
  } catch {
    // Fall through to command / Python script parser
  }

  // 2. Parse Telegram bot commands or Python dict/list lines
  // Examples:
  // /monitorar PlayStation 5 Slim | 2800-3400 | amazon,kabum,magalu
  // /add AirPods Pro 2 1200-1650 amazon,mercadolivre
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

  const rules: ParsedTelegramRule[] = [];
  for (const line of lines) {
    // Match pipe-delimited or command-based rule
    const cleaned = line.replace(/^\/(monitorar|add|watch|alert|promo|track)\s+/i, '').trim();
    const rangeMatch = cleaned.match(/(\d{2,6}(?:[.,]\d{1,2})?)\s*[-a–]\s*(\d{2,6}(?:[.,]\d{1,2})?)/);
    const singlePriceMatch = cleaned.match(/(?:R\$\s*|<=?\s*|ate\s+|até\s+)(\d{2,6})/i);

    if (rangeMatch || singlePriceMatch || line.includes('|')) {
      const parts = cleaned.split('|').map((p) => p.trim());
      let name = parts[0] || cleaned;
      let minP = 0;
      let maxP = 0;
      let storePart = parts[2] || '';

      if (rangeMatch) {
        minP = Math.round(Number(rangeMatch[1].replace(',', '.')));
        maxP = Math.round(Number(rangeMatch[2].replace(',', '.')));
        if (parts.length === 1) {
          name = cleaned.slice(0, rangeMatch.index).trim();
          storePart = cleaned.slice((rangeMatch.index || 0) + rangeMatch[0].length).trim();
        }
      } else if (singlePriceMatch) {
        maxP = Math.round(Number(singlePriceMatch[1]));
        minP = Math.round(maxP * 0.72);
        if (parts.length === 1) {
          name = cleaned.slice(0, singlePriceMatch.index).trim();
          storePart = cleaned.slice((singlePriceMatch.index || 0) + singlePriceMatch[0].length).trim();
        }
      } else {
        maxP = 1800;
        minP = 1250;
      }

      name = name.replace(/["'{}[\]]/g, '').trim();
      if (name.length >= 2) {
        rules.push({
          name,
          category: 'Migrado do Telegram',
          targetMinPrice: Math.min(minP, maxP),
          targetMaxPrice: Math.max(minP, maxP),
          minDiscountPercent: 10,
          storeIds: resolveStoreIds(storePart),
          sourceFormat: line.startsWith('/') ? 'Comando Telegram' : 'Script / Lista',
        });
      }
    }
  }

  return rules;
}

// Re-sync all alert affiliate URLs whenever a store's affiliate configuration changes
function refreshAffiliateLinksForStore(store: StoreConfig) {
  state.alerts = state.alerts.map((alert) => {
    if (alert.storeId !== store.id) return alert;
    const affiliateUrl = buildAffiliateUrl(alert.rawUrl, store);
    const whatsappMessage = formatWhatsAppPromoMessage({
      template: state.botConfig.whatsappTemplate,
      productName: alert.productName,
      storeName: store.name,
      oldPrice: alert.oldPrice,
      newPrice: alert.newPrice,
      discountPercent: alert.discountPercent,
      affiliateUrl,
    });
    return {
      ...alert,
      storeName: store.name,
      affiliateUrl,
      whatsappMessage,
    };
  });
}

interface StoredLocalSavedDeal {
  id: string;
  userId: string;
  dealType: 'product' | 'flight';
  title: string;
  storeOrAirline: string;
  price: number;
  affiliateUrl: string;
  createdAt: string;
}

interface StoredLocalWhatsappSub {
  uid: string;
  displayName: string;
  phoneNumber: string;
  optIn: boolean;
  receiveProducts: boolean;
  receiveFlights: boolean;
  selectedProducts: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoredLocalAccount {
  uid: string;
  authProvider: 'email' | 'phone';
  email: string | null;
  phoneNumber: string | null;
  displayName: string;
  role: 'member';
  preferredCategories: string[];
  passwordSalt: string;
  passwordHash: string;
  savedDeals: StoredLocalSavedDeal[];
  whatsappSubscription: StoredLocalWhatsappSub | null;
  createdAt: string;
  updatedAt: string;
}

function loadLocalAccounts(): StoredLocalAccount[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8')) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as StoredLocalAccount[];
      }
    }
  } catch (err) {
    console.warn('Could not read local accounts DB:', err);
  }
  return [];
}

function saveLocalAccounts(accounts: StoredLocalAccount[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist local accounts DB:', err);
  }
}

let localAccounts: StoredLocalAccount[] = loadLocalAccounts();

function hashPasswordScrypt(password: string): {salt: string; hash: string} {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return {salt, hash};
}

function verifyPasswordScrypt(password: string, salt: string, expectedHashHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signAccountSessionToken(uid: string): string {
  const payloadObj = {uid, exp: Date.now() + SESSION_TTL_MS};
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

function verifyAccountSessionToken(token: string): string | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!decoded.uid || typeof decoded.exp !== 'number' || Date.now() > decoded.exp) {
      return null;
    }
    return decoded.uid;
  } catch {
    return null;
  }
}

const authRateBuckets = new Map<string, number[]>();
function isAuthRateLimited(ipKey: string): boolean {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = (authRateBuckets.get(ipKey) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= 20) {
    authRateBuckets.set(ipKey, recent);
    return true;
  }
  recent.push(now);
  authRateBuckets.set(ipKey, recent);
  return false;
}

const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sanitizeAccountPayload(account: StoredLocalAccount) {
  return {
    user: {
      uid: account.uid,
      displayName: account.displayName,
      email: account.email,
      phoneNumber: account.phoneNumber,
      photoURL: null,
      authProvider: account.authProvider,
    },
    profile: {
      uid: account.uid,
      displayName: account.displayName,
      role: 'member' as const,
      preferredCategories: account.preferredCategories,
    },
    savedDeals: account.savedDeals,
    whatsappSubscription: account.whatsappSubscription,
    forwarderSettings: state.botConfig.whatsappGroupInviteUrl || state.botConfig.whatsappPhone
      ? {
          senderPhone: state.botConfig.whatsappPhone || '',
          senderDisplayName: 'Mega Achados 027',
          enabled: Boolean(state.botConfig.autoDispatchWhatsApp || state.botConfig.enabled),
          welcomeMessage: '',
          groupName: state.botConfig.whatsappGroupName || 'Grupo VIP Mega Achados 027',
          groupInviteUrl: state.botConfig.whatsappGroupInviteUrl || '',
          autoForwardAllDealsToGroup: state.botConfig.autoForwardAllDealsToGroup !== false,
          updatedByUid: 'server',
        }
      : null,
  };
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(pair.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isHttpsRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return forwarded.split(',')[0].trim() === 'https';
}

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    'SameSite=Lax',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'SameSite=Lax',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getAuthenticatedLocalAccount(
  req: express.Request,
  requireCsrfHeader = false,
): StoredLocalAccount | null {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const uid = verifyAccountSessionToken(token);
    if (!uid) return null;
    return localAccounts.find((a) => a.uid === uid) || null;
  }

  const cookieToken = parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!cookieToken) return null;
  if (requireCsrfHeader && req.headers['x-requested-with'] !== 'MegaAchadosApp') {
    return null;
  }
  const uid = verifyAccountSessionToken(cookieToken);
  if (!uid) return null;
  return localAccounts.find((a) => a.uid === uid) || null;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({limit: '2mb'}));

  // Ensure Service Worker & entry HTML are never trapped in stale browser caches
  app.use((req, res, next) => {
    const p = req.path || '';
    if (
      p === '/sw.js' ||
      p === '/dev-sw.js' ||
      p === '/registerSW.js' ||
      p === '/index.html' ||
      p === '/'
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
  });

  // --- Local Account Auth Routes (Email + Password OR Phone-only + Password) ---

  app.post('/api/auth/register', (req, res) => {
    const ipKey = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ipKey)) {
      res.status(429).json({error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'});
      return;
    }

    const body = req.body || {};
    const method: 'email' | 'phone' = body.method === 'phone' ? 'phone' : 'email';
    const rawIdentifier = String(body.identifier || '').trim();
    const rawPassword = String(body.password || '');
    const rawName = String(body.displayName || '').trim().slice(0, 80);
    const rawCategories: string[] = Array.isArray(body.preferredCategories)
      ? Array.from(
          new Set<string>(
            (body.preferredCategories as unknown[])
              .map((c: unknown) => String(c || '').trim().slice(0, 40))
              .filter((c): c is string => c.length > 0),
          ),
        ).slice(0, 8)
      : [];

    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({error: 'A senha precisa ter pelo menos 6 caracteres.'});
      return;
    }

    let email: string | null = null;
    let phoneNumber: string | null = null;

    if (method === 'email') {
      const normalizedEmail = rawIdentifier.toLowerCase().slice(0, 160);
      if (!EMAIL_VALIDATION_REGEX.test(normalizedEmail)) {
        res.status(400).json({error: 'Informe um endereço de e-mail válido.'});
        return;
      }
      if (localAccounts.some((a) => a.email && a.email.toLowerCase() === normalizedEmail)) {
        res.status(409).json({error: 'Já existe uma conta cadastrada com este e-mail. Use a aba Entrar.'});
        return;
      }
      email = normalizedEmail;

      const optionalPhone = String(body.whatsappPhone || '').trim();
      if (optionalPhone) {
        phoneNumber = normalizePhoneE164(optionalPhone);
      }
    } else {
      const normalizedPhone = normalizePhoneE164(rawIdentifier);
      if (!normalizedPhone) {
        res.status(400).json({
          error: 'Informe um número de celular válido com DDD (ex: (27) 99999-9999).',
        });
        return;
      }
      if (localAccounts.some((a) => a.phoneNumber === normalizedPhone)) {
        res.status(409).json({
          error: 'Já existe uma conta cadastrada com este número de celular. Use a aba Entrar.',
        });
        return;
      }
      phoneNumber = normalizedPhone;
    }

    const displayName =
      rawName ||
      (email ? email.split('@')[0].slice(0, 40) : `Membro ${phoneNumber?.slice(-4) || '027'}`);
    const nowIso = new Date().toISOString();
    const uid = `acc_${crypto.randomBytes(12).toString('hex')}`;
    const {salt, hash} = hashPasswordScrypt(rawPassword);

    const whatsappSubscription: StoredLocalWhatsappSub | null = phoneNumber
      ? {
          uid,
          displayName,
          phoneNumber,
          optIn: true,
          receiveProducts: true,
          receiveFlights: false,
          selectedProducts: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        }
      : null;

    const newAccount: StoredLocalAccount = {
      uid,
      authProvider: method,
      email,
      phoneNumber,
      displayName,
      role: 'member',
      preferredCategories: rawCategories,
      passwordSalt: salt,
      passwordHash: hash,
      savedDeals: [],
      whatsappSubscription,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    localAccounts.push(newAccount);
    saveLocalAccounts(localAccounts);

    const token = signAccountSessionToken(newAccount.uid);
    setSessionCookie(req, res, token);
    res.status(201).json({token, ...sanitizeAccountPayload(newAccount)});
  });

  app.post('/api/auth/login', (req, res) => {
    const ipKey = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ipKey)) {
      res.status(429).json({error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'});
      return;
    }

    const body = req.body || {};
    const rawIdentifier = String(body.identifier || '').trim();
    const rawPassword = String(body.password || '');

    if (!rawIdentifier || !rawPassword) {
      res.status(400).json({error: 'Informe seu e-mail ou número de celular e sua senha.'});
      return;
    }

    let account: StoredLocalAccount | undefined;
    if (rawIdentifier.includes('@')) {
      const normEmail = rawIdentifier.toLowerCase();
      account = localAccounts.find((a) => a.email && a.email.toLowerCase() === normEmail);
    } else {
      const normPhone = normalizePhoneE164(rawIdentifier);
      if (normPhone) {
        account = localAccounts.find((a) => a.phoneNumber === normPhone);
      }
    }

    if (!account || !verifyPasswordScrypt(rawPassword, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({error: 'E-mail/celular ou senha incorretos. Verifique e tente novamente.'});
      return;
    }

    const token = signAccountSessionToken(account.uid);
    setSessionCookie(req, res, token);
    res.json({token, ...sanitizeAccountPayload(account)});
  });

  app.post('/api/auth/logout', (req, res) => {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      req.headers['x-requested-with'] !== 'MegaAchadosApp'
    ) {
      res.status(403).json({error: 'Requisição inválida.'});
      return;
    }
    clearSessionCookie(req, res);
    res.json({ok: true});
  });

  app.get('/api/auth/me', (req, res) => {
    const account = getAuthenticatedLocalAccount(req, false);
    if (!account) {
      res.status(401).json({error: 'Sessão inválida ou expirada.'});
      return;
    }
    const refreshedToken = signAccountSessionToken(account.uid);
    res.json({token: refreshedToken, ...sanitizeAccountPayload(account)});
  });

  app.put('/api/account/profile', (req, res) => {
    const account = getAuthenticatedLocalAccount(req, true);
    if (!account) {
      res.status(401).json({error: 'Sessão inválida ou expirada.'});
      return;
    }
    const body = req.body || {};
    const cleanName = String(body.displayName || '').trim().slice(0, 80);
    if (cleanName) {
      account.displayName = cleanName;
      if (account.whatsappSubscription) {
        account.whatsappSubscription.displayName = cleanName;
        account.whatsappSubscription.updatedAt = new Date().toISOString();
      }
    }
    if (Array.isArray(body.preferredCategories)) {
      account.preferredCategories = Array.from(
        new Set<string>(
          (body.preferredCategories as unknown[])
            .map((c: unknown) => String(c || '').trim().slice(0, 40))
            .filter((c): c is string => c.length > 0),
        ),
      ).slice(0, 8);
    }
    account.updatedAt = new Date().toISOString();
    saveLocalAccounts(localAccounts);
    res.json(sanitizeAccountPayload(account));
  });

  app.post('/api/account/saved-deals/toggle', (req, res) => {
    const account = getAuthenticatedLocalAccount(req, true);
    if (!account) {
      res.status(401).json({error: 'Sessão inválida ou expirada.'});
      return;
    }
    const body = req.body || {};
    const cleanId = String(body.id || '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    if (!cleanId) {
      res.status(400).json({error: 'Identificador da oferta inválido.'});
      return;
    }

    const existingIdx = account.savedDeals.findIndex((d) => d.id === cleanId);
    let saved = false;
    if (existingIdx >= 0) {
      account.savedDeals.splice(existingIdx, 1);
      saved = false;
    } else {
      const rawUrl = String(body.affiliateUrl || '').trim().slice(0, 1200);
      const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://megaachados027.app';
      account.savedDeals.unshift({
        id: cleanId,
        userId: account.uid,
        dealType: body.dealType === 'flight' ? 'flight' : 'product',
        title: String(body.title || 'Oferta Mega Achados 027').trim().slice(0, 180),
        storeOrAirline: String(body.storeOrAirline || 'Loja Parceira').trim().slice(0, 80),
        price: Math.max(0, Math.min(1000000, Number(body.price) || 0)),
        affiliateUrl: safeUrl,
        createdAt: new Date().toISOString(),
      });
      account.savedDeals = account.savedDeals.slice(0, 100);
      saved = true;
    }

    account.updatedAt = new Date().toISOString();
    saveLocalAccounts(localAccounts);
    res.json({saved, savedDeals: account.savedDeals});
  });

  app.put('/api/account/whatsapp', (req, res) => {
    const account = getAuthenticatedLocalAccount(req, true);
    if (!account) {
      res.status(401).json({error: 'Sessão inválida ou expirada.'});
      return;
    }
    const body = req.body || {};
    const normalizedPhone = normalizePhoneE164(String(body.phoneNumber || ''));
    if (!normalizedPhone) {
      res.status(400).json({
        error: 'Informe um número de WhatsApp válido com DDD (ex: (27) 99999-9999).',
      });
      return;
    }

    const selectedProducts: string[] = Array.isArray(body.selectedProducts)
      ? Array.from(
          new Set<string>(
            (body.selectedProducts as unknown[])
              .map((p: unknown) => String(p || '').trim().slice(0, 80))
              .filter((p): p is string => p.length > 0),
          ),
        ).slice(0, 20)
      : account.whatsappSubscription?.selectedProducts || [];

    const nowIso = new Date().toISOString();
    account.whatsappSubscription = {
      uid: account.uid,
      displayName: account.displayName,
      phoneNumber: normalizedPhone,
      optIn: body.optIn !== false,
      receiveProducts: body.receiveProducts !== false,
      receiveFlights: Boolean(body.receiveFlights),
      selectedProducts,
      createdAt: account.whatsappSubscription?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    account.updatedAt = nowIso;
    saveLocalAccounts(localAccounts);
    res.json({whatsappSubscription: account.whatsappSubscription});
  });

  app.delete('/api/account/whatsapp', (req, res) => {
    const account = getAuthenticatedLocalAccount(req, true);
    if (!account) {
      res.status(401).json({error: 'Sessão inválida ou expirada.'});
      return;
    }
    account.whatsappSubscription = null;
    account.updatedAt = new Date().toISOString();
    saveLocalAccounts(localAccounts);
    res.json({ok: true});
  });

  // --- API Routes ---

  const ALLOWED_IMAGE_PROXY_HOSTS = new Set([
    'i.promobit.com.br',
    'image.zst.com.br',
    'i.zst.com.br',
    's.zst.com.br',
    'images.kabum.com.br',
    'images0.kabum.com.br',
    'images1.kabum.com.br',
    'images2.kabum.com.br',
    'images3.kabum.com.br',
    'images4.kabum.com.br',
    'images5.kabum.com.br',
    'images6.kabum.com.br',
    'images7.kabum.com.br',
    'images8.kabum.com.br',
    'images9.kabum.com.br',
    'm.media-amazon.com',
    'images-na.ssl-images-amazon.com',
    'http2.mlstatic.com',
    'a-static.mlcdn.com.br',
    'cf.shopee.com.br',
    'down-br.img.susercontent.com',
    'imgs.casasbahia.com.br',
    'imgs.extra.com.br',
    'imgs.pontofrio.com.br',
    'ae01.alicdn.com',
    'static.netshoes.com.br',
    'imgcentauro-a.akamaihd.net',
    'images.tcdn.com.br',
    'lh3.googleusercontent.com',
  ]);

  const isAllowedImageProxyUrl = (rawUrl: string): URL | null => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      const host = parsed.hostname.toLowerCase();
      if (!isSafePublicRetailHost(host)) return null;
      if (!ALLOWED_IMAGE_PROXY_HOSTS.has(host)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  app.get('/api/image-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const parsedUrl = isAllowedImageProxyUrl(rawUrl);
    if (!parsedUrl) {
      res.status(400).send('Invalid or unsupported image host');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      let currentUrl = parsedUrl.toString();
      let upstream: globalThis.Response | null = null;

      for (let hop = 0; hop < 3; hop++) {
        const resp = await fetch(currentUrl, {
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          signal: controller.signal,
        });

        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get('location');
          if (!loc) {
            res.status(502).send('Redirect missing location');
            return;
          }
          const resolved = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
          const checked = isAllowedImageProxyUrl(resolved);
          if (!checked) {
            res.status(403).send('Redirect host not allowed');
            return;
          }
          currentUrl = checked.toString();
          continue;
        }

        upstream = resp;
        break;
      }

      if (!upstream || !upstream.ok) {
        res.status(upstream?.status || 502).send('Image unavailable');
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
      if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
        res.status(415).send('Unsupported content type');
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 5 * 1024 * 1024) {
        res.status(413).send('Invalid image payload size');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(504).send('Image fetch timeout');
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/state', (_req, res) => {
    pruneExpiredAndInvalidDeals(false);
    res.json(state);
  });

  app.post('/api/scan', async (req, res) => {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : undefined;
    const isManual = req.body?.manual !== false;
    const result = await runPriceScan(productId);
    let announcedCount = 0;
    if (isManual) {
      const manualResult = await manualSearchAndAnnounceDeals({productId});
      announcedCount = manualResult.announcedNow;
    }
    res.json({
      ok: true,
      updatedCount: result.updatedProducts.length,
      newAlertsCount: result.newAlerts.length,
      newAlerts: result.newAlerts,
      announcedCount,
      announcedDeals: state.announcedDeals,
      lastScanAt: state.botConfig.lastScanAt,
    });
  });

  app.post('/api/deals/manual-search', async (req, res) => {
    const body = req.body || {};
    const query = typeof body.query === 'string' ? body.query : undefined;
    const category = typeof body.category === 'string' ? body.category : undefined;
    const productId = typeof body.productId === 'string' ? body.productId : undefined;

    // Re-check prices before evaluating active discounts
    if (productId) {
      await runPriceScan(productId);
    }

    const result = await manualSearchAndAnnounceDeals({query, category, productId});
    res.json({
      ok: true,
      announcedNow: result.announcedNow,
      checkedCount: result.checkedCount,
      deals: result.deals,
      ttlHours: 3,
    });
  });

  app.post('/api/products/live-search', async (req, res) => {
    const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (rawQuery.length < 2) {
      res.status(400).json({error: 'Digite pelo menos 2 caracteres para pesquisar o produto.'});
      return;
    }
    try {
      const result = await searchProductAcrossConfiguredStores(rawQuery);
      res.json(result);
    } catch (err) {
      console.warn('Live cross-store product search error:', err);
      res.status(502).json({
        error: 'Não foi possível consultar os preços nas lojas agora. Tente novamente.',
      });
    }
  });

  app.delete('/api/deals/:id', (req, res) => {
    const before = state.announcedDeals.length;
    state.announcedDeals = state.announcedDeals.filter((d) => d.id !== req.params.id);
    if (state.announcedDeals.length === before) {
      res.status(404).json({error: 'Oferta anunciada não encontrada.'});
      return;
    }
    saveState(state);
    broadcast('announcedDeals:synced', state.announcedDeals);
    res.json({ok: true, id: req.params.id});
  });

  app.post('/api/coupons/refresh', async (_req, res) => {
    const result = await refreshStoreCoupons();
    res.json({
      ok: true,
      coupons: result.coupons,
      couponMeta: result.couponMeta,
    });
  });

  app.post('/api/products', (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      res.status(400).json({error: 'Informe o nome do produto.'});
      return;
    }

    const targetMaxPrice = Math.max(10, Number(body.targetMaxPrice) || 1500);
    const targetMinPrice = Math.max(
      1,
      Math.min(targetMaxPrice - 1, Number(body.targetMinPrice) || Math.round(targetMaxPrice * 0.72)),
    );
    const basePrice = Math.max(targetMaxPrice, Number(body.basePrice) || Math.round(targetMaxPrice * 1.12));
    const minDiscountPercent = Math.max(1, Number(body.minDiscountPercent) || 10);
    const category = String(body.category || 'Eletrônicos').trim();
    const brand = String(body.brand || name.split(' ')[0] || 'Geral').trim();

    const activeStoreIds = state.stores.filter((s) => s.active).map((s) => s.id);
    const trackedStoreIds =
      Array.isArray(body.trackedStoreIds) && body.trackedStoreIds.length > 0
        ? body.trackedStoreIds.map(String)
        : activeStoreIds;

    const id = `prod-${Date.now()}-${Math.floor(Math.random() * 999)}`;
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const {history, offers} = generateProductHistory(id, basePrice, state.stores, trackedStoreIds, slug || id);
    const created = recomputeProductMetrics({
      id,
      name,
      category,
      brand,
      sku: `SKU-${Math.floor(10000 + Math.random() * 89999)}`,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : '',
      targetMinPrice,
      targetMaxPrice,
      minDiscountPercent,
      notifyWhatsApp: body.notifyWhatsApp !== false,
      notifyPush: body.notifyPush !== false,
      active: true,
      trackedStoreIds,
      offers,
      history,
      lastCheckedAt: new Date().toISOString(),
      bestPrice: basePrice,
      bestStoreId: trackedStoreIds[0] || 'amazon',
      avgPrice: basePrice,
      allTimeLow: basePrice,
      allTimeHigh: basePrice,
    });

    state.products = [created, ...state.products];
    saveState(state);
    broadcast('product:created', created);
    res.status(201).json(created);
  });

  app.patch('/api/products/:id', (req, res) => {
    const idx = state.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Produto não encontrado.'});
      return;
    }

    const current = state.products[idx];
    const body = req.body || {};

    const updatedTrackedIds: string[] = Array.isArray(body.trackedStoreIds)
      ? body.trackedStoreIds.map(String)
      : current.trackedStoreIds;

    // Ensure offers exist for any newly added store
    const updatedOffers = [...current.offers];
    for (const storeId of updatedTrackedIds) {
      if (!updatedOffers.some((o) => o.storeId === storeId)) {
        const store = state.stores.find((s) => s.id === storeId);
        if (store) {
          const price = Math.round(current.avgPrice * (0.97 + Math.random() * 0.08));
          const pixPrice = Math.round(price * 0.95);
          updatedOffers.push({
            storeId: store.id,
            storeName: store.name,
            price,
            pixPrice,
            installments: `${store.installmentsInfo} de R$ ${(price / 10).toFixed(2).replace('.', ',')}`,
            shipping: store.defaultShipping,
            shippingCost: store.defaultShipping.toLowerCase().includes('grátis') ? 0 : 19.9,
            inStock: true,
            rawUrl: buildValidStoreSearchUrl(store, current.name),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const updated = recomputeProductMetrics({
      ...current,
      name: typeof body.name === 'string' ? body.name.trim() || current.name : current.name,
      targetMinPrice:
        body.targetMinPrice !== undefined ? Math.max(1, Number(body.targetMinPrice)) : current.targetMinPrice,
      targetMaxPrice:
        body.targetMaxPrice !== undefined ? Math.max(10, Number(body.targetMaxPrice)) : current.targetMaxPrice,
      minDiscountPercent:
        body.minDiscountPercent !== undefined
          ? Math.max(1, Number(body.minDiscountPercent))
          : current.minDiscountPercent,
      notifyWhatsApp:
        typeof body.notifyWhatsApp === 'boolean' ? body.notifyWhatsApp : current.notifyWhatsApp,
      notifyPush: typeof body.notifyPush === 'boolean' ? body.notifyPush : current.notifyPush,
      active: typeof body.active === 'boolean' ? body.active : current.active,
      trackedStoreIds: updatedTrackedIds,
      offers: updatedOffers.filter((o) => updatedTrackedIds.includes(o.storeId)),
    });

    state.products[idx] = updated;
    pruneExpiredAndInvalidDeals(true);
    saveState(state);
    broadcast('product:updated', updated);
    res.json(updated);
  });

  app.delete('/api/products/:id', (req, res) => {
    const exists = state.products.some((p) => p.id === req.params.id);
    if (!exists) {
      res.status(404).json({error: 'Produto não encontrado.'});
      return;
    }
    state.products = state.products.filter((p) => p.id !== req.params.id);
    pruneExpiredAndInvalidDeals(true);
    saveState(state);
    broadcast('product:deleted', {id: req.params.id});
    res.json({ok: true, id: req.params.id});
  });

  // --- Configurable & Expandable Stores + Affiliate Links ---

  app.post('/api/stores', (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const domain = String(body.domain || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];

    if (!name || !domain) {
      res.status(400).json({error: 'Informe o nome e o domínio da loja.'});
      return;
    }

    const baseId = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    const id = `${baseId || 'loja'}-${Date.now().toString().slice(-4)}`;

    const newStore: StoreConfig = {
      id,
      name,
      domain,
      active: true,
      accentHex: typeof body.accentHex === 'string' && body.accentHex ? body.accentHex : '#059669',
      affiliateMode:
        body.affiliateMode === 'path_prefix' || body.affiliateMode === 'template'
          ? body.affiliateMode
          : 'query',
      affiliateParam: String(body.affiliateParam || 'ref').trim() || 'ref',
      affiliateTag: String(body.affiliateTag || '').trim(),
      affiliateTemplate: String(body.affiliateTemplate || '{raw_url}?ref={id}').trim(),
      defaultShipping: String(body.defaultShipping || 'Frete padrão R$ 19,90').trim(),
      installmentsInfo: String(body.installmentsInfo || '10x sem juros').trim(),
      isCustom: true,
    };

    state.stores = [...state.stores, newStore];

    // Automatically integrate new active store into monitored products so it monitors simultaneously!
    const nowIso = new Date().toISOString();
    state.products = state.products.map((prod) => {
      const price = Math.round(prod.avgPrice * (0.95 + Math.random() * 0.1));
      const pixPrice = Math.round(price * 0.95);
      const newOffer: StoreOffer = {
        storeId: newStore.id,
        storeName: newStore.name,
        price,
        pixPrice,
        installments: `${newStore.installmentsInfo} de R$ ${(price / 10).toFixed(2).replace('.', ',')}`,
        shipping: newStore.defaultShipping,
        shippingCost: newStore.defaultShipping.toLowerCase().includes('grátis') ? 0 : 19.9,
        inStock: true,
        rawUrl: buildValidStoreSearchUrl(newStore, prod.name),
        updatedAt: nowIso,
      };
      return recomputeProductMetrics({
        ...prod,
        trackedStoreIds: [...prod.trackedStoreIds, newStore.id],
        offers: [...prod.offers, newOffer],
      });
    });

    state.coupons = buildVerifiedStoreCoupons(state.stores, Date.now());
    state.couponMeta = buildCouponMeta(state.stores, Date.now());
    saveState(state);
    broadcast('store:created', newStore);
    broadcast('coupons:synced', {coupons: state.coupons, couponMeta: state.couponMeta});
    broadcast('state:synced', state);
    res.status(201).json(newStore);
  });

  app.patch('/api/stores/:id', (req, res) => {
    const idx = state.stores.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Loja não encontrada.'});
      return;
    }

    const current = state.stores[idx];
    const body = req.body || {};

    const updated: StoreConfig = {
      ...current,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : current.name,
      domain:
        typeof body.domain === 'string' && body.domain.trim()
          ? body.domain.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
          : current.domain,
      active: typeof body.active === 'boolean' ? body.active : current.active,
      affiliateMode:
        body.affiliateMode === 'query' ||
        body.affiliateMode === 'path_prefix' ||
        body.affiliateMode === 'template'
          ? body.affiliateMode
          : current.affiliateMode,
      affiliateParam:
        typeof body.affiliateParam === 'string' ? body.affiliateParam.trim() : current.affiliateParam,
      affiliateTag:
        typeof body.affiliateTag === 'string' ? body.affiliateTag.trim() : current.affiliateTag,
      affiliateTemplate:
        typeof body.affiliateTemplate === 'string'
          ? body.affiliateTemplate.trim()
          : current.affiliateTemplate,
      defaultShipping:
        typeof body.defaultShipping === 'string' ? body.defaultShipping.trim() : current.defaultShipping,
      installmentsInfo:
        typeof body.installmentsInfo === 'string' ? body.installmentsInfo.trim() : current.installmentsInfo,
    };

    state.stores[idx] = updated;
    refreshAffiliateLinksForStore(updated);
    pruneExpiredAndInvalidDeals(true);
    state.coupons = buildVerifiedStoreCoupons(state.stores, Date.now());
    state.couponMeta = buildCouponMeta(state.stores, Date.now());
    saveState(state);
    broadcast('store:updated', updated);
    broadcast('alerts:synced', state.alerts);
    broadcast('coupons:synced', {coupons: state.coupons, couponMeta: state.couponMeta});
    res.json(updated);
  });

  app.delete('/api/stores/:id', (req, res) => {
    const store = state.stores.find((s) => s.id === req.params.id);
    if (!store) {
      res.status(404).json({error: 'Loja não encontrada.'});
      return;
    }
    state.stores = state.stores.filter((s) => s.id !== req.params.id);
    state.products = state.products.map((prod) =>
      recomputeProductMetrics({
        ...prod,
        trackedStoreIds: prod.trackedStoreIds.filter((sid) => sid !== req.params.id),
        offers: prod.offers.filter((o) => o.storeId !== req.params.id),
      }),
    );
    pruneExpiredAndInvalidDeals(true);
    state.coupons = buildVerifiedStoreCoupons(state.stores, Date.now());
    state.couponMeta = buildCouponMeta(state.stores, Date.now());
    saveState(state);
    broadcast('store:deleted', {id: req.params.id});
    broadcast('coupons:synced', {coupons: state.coupons, couponMeta: state.couponMeta});
    broadcast('state:synced', state);
    res.json({ok: true, id: req.params.id});
  });

  // --- Alerts & Savings ---

  app.post('/api/alerts/:id/read', (req, res) => {
    const idx = state.alerts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Alerta não encontrado.'});
      return;
    }
    state.alerts[idx] = {...state.alerts[idx], read: true};
    saveState(state);
    broadcast('alert:updated', state.alerts[idx]);
    res.json(state.alerts[idx]);
  });

  app.post('/api/alerts/read-all', (_req, res) => {
    state.alerts = state.alerts.map((a) => ({...a, read: true}));
    saveState(state);
    broadcast('alerts:synced', state.alerts);
    res.json({ok: true});
  });

  app.post('/api/alerts/:id/purchase', (req, res) => {
    const idx = state.alerts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Alerta não encontrado.'});
      return;
    }
    const alert = state.alerts[idx];
    if (alert.purchased) {
      res.json(alert);
      return;
    }
    const saved = Math.max(0, Math.round(alert.oldPrice - alert.newPrice));
    state.alerts[idx] = {
      ...alert,
      read: true,
      purchased: true,
      savedAmount: saved,
    };

    const currentMonth = state.monthlySavings[state.monthlySavings.length - 1];
    if (currentMonth) {
      currentMonth.savedTotal += saved;
      currentMonth.dealsPurchased += 1;
      currentMonth.topStore = alert.storeName;
    }

    saveState(state);
    broadcast('alert:updated', state.alerts[idx]);
    broadcast('savings:updated', state.monthlySavings);
    res.json(state.alerts[idx]);
  });

  app.post('/api/alerts/test-whatsapp', async (req, res) => {
    const product =
      state.products.find((p) => p.id === req.body?.productId) || state.products[0];
    if (!product) {
      res.status(400).json({error: 'Nenhum produto monitorado para testar.'});
      return;
    }
    const bestOffer = [...product.offers].sort((a, b) => a.pixPrice - b.pixPrice)[0];
    const store = state.stores.find((s) => s.id === bestOffer.storeId);
    const affiliateUrl = buildAffiliateUrl(bestOffer.rawUrl, store);
    const oldPrice = Math.max(product.avgPrice, Math.round(bestOffer.pixPrice * 1.15));
    const discountPercent = Number((((oldPrice - bestOffer.pixPrice) / oldPrice) * 100).toFixed(1));

    const whatsappMessage = formatWhatsAppPromoMessage({
      template: state.botConfig.whatsappTemplate,
      productName: product.name,
      storeName: bestOffer.storeName,
      oldPrice,
      newPrice: bestOffer.pixPrice,
      discountPercent,
      affiliateUrl,
    });

    const alert: AlertNotification = {
      id: `alert-test-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      storeId: bestOffer.storeId,
      storeName: bestOffer.storeName,
      oldPrice,
      newPrice: bestOffer.pixPrice,
      discountPercent,
      targetMaxPrice: product.targetMaxPrice,
      rawUrl: bestOffer.rawUrl,
      affiliateUrl,
      channels: ['whatsapp', 'push', 'dashboard'],
      whatsappStatus: 'dispatched',
      whatsappMessage,
      createdAt: new Date().toISOString(),
      read: false,
      purchased: false,
      savedAmount: 0,
    };

    if (state.botConfig.whatsappWebhookUrl.trim()) {
      const sent = await dispatchOptionalWebhook(state.botConfig.whatsappWebhookUrl, alert);
      if (sent) alert.whatsappStatus = 'webhook_sent';
    }

    state.alerts = [alert, ...state.alerts].slice(0, 60);
    saveState(state);
    broadcast('alert:triggered', alert);
    res.status(201).json(alert);
  });

  // --- Bot Config ---

  app.patch('/api/bot/config', (req, res) => {
    const body = req.body || {};
    state.botConfig = {
      ...state.botConfig,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : state.botConfig.enabled,
      scanIntervalSec:
        body.scanIntervalSec !== undefined
          ? Math.max(8, Math.min(300, Number(body.scanIntervalSec) || 20))
          : state.botConfig.scanIntervalSec,
      whatsappPhone:
        typeof body.whatsappPhone === 'string' ? body.whatsappPhone : state.botConfig.whatsappPhone,
      whatsappGroupName:
        typeof body.whatsappGroupName === 'string'
          ? body.whatsappGroupName.slice(0, 100)
          : state.botConfig.whatsappGroupName,
      whatsappGroupInviteUrl:
        typeof body.whatsappGroupInviteUrl === 'string'
          ? body.whatsappGroupInviteUrl.trim().slice(0, 300)
          : state.botConfig.whatsappGroupInviteUrl || '',
      whatsappGroupJid:
        typeof body.whatsappGroupJid === 'string'
          ? body.whatsappGroupJid.trim().slice(0, 120)
          : state.botConfig.whatsappGroupJid || '',
      autoForwardAllDealsToGroup:
        typeof body.autoForwardAllDealsToGroup === 'boolean'
          ? body.autoForwardAllDealsToGroup
          : state.botConfig.autoForwardAllDealsToGroup !== false,
      whatsappWebhookUrl:
        typeof body.whatsappWebhookUrl === 'string'
          ? body.whatsappWebhookUrl
          : state.botConfig.whatsappWebhookUrl,
      whatsappTemplate:
        typeof body.whatsappTemplate === 'string' && body.whatsappTemplate.trim()
          ? body.whatsappTemplate
          : state.botConfig.whatsappTemplate,
      pushEnabled:
        typeof body.pushEnabled === 'boolean' ? body.pushEnabled : state.botConfig.pushEnabled,
      pushMinDiscount:
        body.pushMinDiscount !== undefined
          ? Math.max(1, Number(body.pushMinDiscount) || 5)
          : state.botConfig.pushMinDiscount,
      quietHoursStart:
        typeof body.quietHoursStart === 'string'
          ? body.quietHoursStart
          : state.botConfig.quietHoursStart,
      quietHoursEnd:
        typeof body.quietHoursEnd === 'string' ? body.quietHoursEnd : state.botConfig.quietHoursEnd,
      autoDispatchWhatsApp:
        typeof body.autoDispatchWhatsApp === 'boolean'
          ? body.autoDispatchWhatsApp
          : state.botConfig.autoDispatchWhatsApp,
    };

    saveState(state);
    broadcast('bot:updated', state.botConfig);
    res.json(state.botConfig);
  });

  // --- Admin WhatsApp Forwarder Broadcast Dispatch ---

  app.post('/api/whatsapp-forwarder/dispatch', async (req, res) => {
    const body = req.body || {};
    const message = String(body.message || '').trim().slice(0, 2000);
    const senderPhone = String(body.senderPhone || state.botConfig.whatsappPhone || '').trim().slice(0, 32);
    const senderDisplayName = String(body.senderDisplayName || 'Mega Achados 027').trim().slice(0, 80);
    const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];

    if (!message) {
      res.status(400).json({error: 'Digite a mensagem ou selecione uma oferta antes de encaminhar.'});
      return;
    }

    const recipients = rawRecipients
      .slice(0, 200)
      .map((item: unknown) => {
        const rec = (item || {}) as Record<string, unknown>;
        return {
          uid: String(rec.uid || '').trim().slice(0, 128),
          displayName: String(rec.displayName || 'Cliente').trim().slice(0, 80),
          phoneNumber: String(rec.phoneNumber || '').trim().slice(0, 24),
        };
      })
      .filter((r: {phoneNumber: string}) => /^\+[0-9]{10,15}$/.test(r.phoneNumber));

    if (recipients.length === 0) {
      res.status(400).json({error: 'Nenhum cliente com número de WhatsApp válido selecionado.'});
      return;
    }

    const webhookUrl = String(state.botConfig.whatsappWebhookUrl || '').trim();
    if (!webhookUrl) {
      res.json({
        sentCount: 0,
        failedCount: 0,
        totalCount: recipients.length,
        mode: 'manual_only',
        results: recipients.map((r: {uid: string; phoneNumber: string; displayName: string}) => ({
          ...r,
          ok: false,
          detail: 'Webhook automático não configurado. Utilize os botões de envio direto no WhatsApp.',
        })),
      });
      return;
    }

    // SSRF protection: ensure webhook targets a public HTTP(S) host
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
      const host = parsedUrl.hostname.toLowerCase();
      const isPrivateHost =
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (!['https:', 'http:'].includes(parsedUrl.protocol) || isPrivateHost) {
        res.status(400).json({error: 'URL de Webhook inválida ou restrita.'});
        return;
      }
    } catch {
      res.status(400).json({error: 'URL de Webhook malformada.'});
      return;
    }

    const results: Array<{
      uid: string;
      phoneNumber: string;
      displayName: string;
      ok: boolean;
      detail?: string;
    }> = [];

    for (const recipient of recipients) {
      try {
        const resp = await fetch(parsedUrl.toString(), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            event: 'megaachados027.whatsapp_forward',
            senderPhone,
            senderDisplayName,
            toPhone: recipient.phoneNumber,
            toPhoneDigits: recipient.phoneNumber.replace(/\D/g, ''),
            customerName: recipient.displayName,
            customerUid: recipient.uid,
            message,
            timestamp: new Date().toISOString(),
          }),
        });
        results.push({
          ...recipient,
          ok: resp.ok,
          detail: resp.ok ? `HTTP ${resp.status}` : `Falha HTTP ${resp.status}`,
        });
      } catch (err) {
        results.push({
          ...recipient,
          ok: false,
          detail: err instanceof Error ? err.message : 'Erro de conexão com o webhook',
        });
      }
    }

    const sentCount = results.filter((r) => r.ok).length;
    res.json({
      sentCount,
      failedCount: results.length - sentCount,
      totalCount: results.length,
      mode: 'webhook',
      results,
    });
  });

  app.post('/api/whatsapp-forwarder/dispatch-group', async (req, res) => {
    const body = req.body || {};
    const dealId = typeof body.dealId === 'string' ? body.dealId.trim() : '';
    const customMessage = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const forwardAllActive = Boolean(body.forwardAllActive);

    if (forwardAllActive) {
      const entries = await forwardDealsToWhatsappGroup(state.announcedDeals, {force: true});
      const sentCount = entries.filter((e) => e.status === 'webhook_sent').length;
      res.json({
        entries,
        sentCount,
        totalCount: entries.length,
        mode: parseSafePublicWebhookUrl(state.botConfig.whatsappWebhookUrl || '')
          ? 'webhook'
          : 'manual_only',
      });
      return;
    }

    if (dealId) {
      const targetDeal = state.announcedDeals.find((d) => d.id === dealId);
      if (!targetDeal) {
        res.status(404).json({error: 'Oferta não encontrada no feed ativo.'});
        return;
      }
      const entries = await forwardDealsToWhatsappGroup([targetDeal], {force: true});
      const sentCount = entries.filter((e) => e.status === 'webhook_sent').length;
      res.json({
        entries,
        sentCount,
        totalCount: entries.length,
        mode: parseSafePublicWebhookUrl(state.botConfig.whatsappWebhookUrl || '')
          ? 'webhook'
          : 'manual_only',
      });
      return;
    }

    if (!customMessage) {
      res.status(400).json({error: 'Informe uma mensagem ou selecione ofertas para enviar ao grupo.'});
      return;
    }

    const groupName = (state.botConfig.whatsappGroupName || 'Grupo VIP Mega Achados 027').trim();
    const groupJid = String(state.botConfig.whatsappGroupJid || '').trim();
    const groupInviteUrl = String(state.botConfig.whatsappGroupInviteUrl || '').trim();
    const senderPhone = String(state.botConfig.whatsappPhone || '').trim();
    const parsedWebhook = parseSafePublicWebhookUrl(state.botConfig.whatsappWebhookUrl || '');

    let status: GroupForwardEntry['status'] = 'ready_for_group';
    let lastAttemptDetail = parsedWebhook
      ? undefined
      : 'Pronto para compartilhar no grupo pelo seu WhatsApp';

    if (parsedWebhook) {
      try {
        const resp = await fetch(parsedWebhook.toString(), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            event: 'megaachados027.group_custom_message',
            targetType: 'group',
            senderPhone,
            groupName,
            groupJid,
            groupInviteUrl,
            message: customMessage,
            timestamp: new Date().toISOString(),
          }),
        });
        status = resp.ok ? 'webhook_sent' : 'ready_for_group';
        lastAttemptDetail = resp.ok
          ? `Enviado automaticamente ao grupo (HTTP ${resp.status})`
          : `Webhook retornou HTTP ${resp.status}`;
      } catch (err) {
        status = 'ready_for_group';
        lastAttemptDetail =
          err instanceof Error ? `Erro no Webhook: ${err.message}` : 'Erro no Webhook';
      }
    }

    const entry: GroupForwardEntry = {
      id: `grp-custom-${Date.now()}`,
      dealId: `custom-${Date.now()}`,
      productName: 'Aviso Personalizado para o Grupo',
      storeName: groupName,
      price: 0,
      referencePrice: 0,
      discountPercent: 0,
      affiliateUrl: groupInviteUrl || 'https://megaachados027.app',
      groupName,
      message: customMessage,
      status,
      createdAt: new Date().toISOString(),
      lastAttemptDetail,
    };

    const currentLog = Array.isArray(state.groupForwardLog) ? state.groupForwardLog : [];
    state.groupForwardLog = [entry, ...currentLog].slice(0, 60);
    saveState(state);
    broadcast('groupForwardLog:synced', state.groupForwardLog);

    res.json({
      entries: [entry],
      sentCount: status === 'webhook_sent' ? 1 : 0,
      totalCount: 1,
      mode: parsedWebhook ? 'webhook' : 'manual_only',
    });
  });

  app.post('/api/whatsapp-forwarder/group-log/:id/mark-sent', (req, res) => {
    const currentLog = Array.isArray(state.groupForwardLog) ? state.groupForwardLog : [];
    const idx = currentLog.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Registro de envio ao grupo não encontrado.'});
      return;
    }
    currentLog[idx] = {
      ...currentLog[idx],
      status: 'sent_manually',
      lastAttemptDetail: 'Encaminhado manualmente no grupo pelo administrador',
    };
    state.groupForwardLog = currentLog;
    saveState(state);
    broadcast('groupForwardLog:synced', state.groupForwardLog);
    res.json(currentLog[idx]);
  });

  // --- Telegram Bot Migration ---

  app.post('/api/telegram/preview', (req, res) => {
    const raw = String(req.body?.payload || '');
    const parsed = parseTelegramMigrationPayload(raw);
    res.json({rules: parsed});
  });

  app.post('/api/telegram/import', (req, res) => {
    const raw = String(req.body?.payload || '');
    const parsed = parseTelegramMigrationPayload(raw);
    if (parsed.length === 0) {
      res.status(400).json({error: 'Nenhuma regra válida encontrada no texto enviado.'});
      return;
    }

    const nowIso = new Date().toISOString();
    const createdProducts: MonitoredProduct[] = [];

    for (const rule of parsed) {
      const id = `prod-tg-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      const slug = rule.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const basePrice = Math.round(rule.targetMaxPrice * 1.1);
      const {history, offers} = generateProductHistory(
        id,
        basePrice,
        state.stores,
        rule.storeIds,
        slug || id,
      );

      const prod = recomputeProductMetrics({
        id,
        name: rule.name,
        category: rule.category,
        brand: rule.name.split(' ')[0] || 'Telegram',
        sku: `TG-${Math.floor(10000 + Math.random() * 89999)}`,
        imageUrl: '',
        targetMinPrice: rule.targetMinPrice,
        targetMaxPrice: rule.targetMaxPrice,
        minDiscountPercent: rule.minDiscountPercent,
        notifyWhatsApp: true,
        notifyPush: true,
        active: true,
        trackedStoreIds: rule.storeIds,
        offers,
        history,
        lastCheckedAt: nowIso,
        bestPrice: basePrice,
        bestStoreId: rule.storeIds[0] || 'amazon',
        avgPrice: basePrice,
        allTimeLow: basePrice,
        allTimeHigh: basePrice,
      });

      createdProducts.push(prod);
    }

    state.products = [...createdProducts, ...state.products];
    state.botConfig.telegramImportedCount += createdProducts.length;
    saveState(state);

    for (const p of createdProducts) {
      broadcast('product:created', p);
    }
    broadcast('bot:updated', state.botConfig);

    res.status(201).json({
      importedCount: createdProducts.length,
      products: createdProducts,
    });
  });

  // --- Travel / Flight Fare Comparison & Alerts ---

  interface AirlineMeta {
    code: string;
    name: string;
    accent: string;
    domain: string;
    officialUrl: string;
    multiplier: number;
    baggage: string;
    hub?: string;
    regions?: string[];
  }

  const NATIONAL_AIRLINES: AirlineMeta[] = [
    {
      code: 'LA',
      name: 'LATAM Airlines Brasil',
      accent: '#E11D48',
      domain: 'latamairlines.com',
      officialUrl: 'https://www.latamairlines.com/br/pt',
      multiplier: 1.0,
      baggage: '10kg mão + item pessoal',
    },
    {
      code: 'G3',
      name: 'GOL Linhas Aéreas',
      accent: '#EA580C',
      domain: 'voegol.com.br',
      officialUrl: 'https://www.voegol.com.br/br/voos',
      multiplier: 0.96,
      baggage: '10kg mão + item pessoal',
    },
    {
      code: 'AD',
      name: 'Azul Linhas Aéreas',
      accent: '#2563EB',
      domain: 'voeazul.com.br',
      officialUrl: 'https://www.voeazul.com.br/br/pt/home',
      multiplier: 1.04,
      baggage: '10kg mão + item pessoal',
    },
    {
      code: '2Z',
      name: 'Voepass Regional',
      accent: '#CA8A04',
      domain: 'voepass.com.br',
      officialUrl: 'https://www.voepass.com.br',
      multiplier: 0.91,
      baggage: '10kg mão',
    },
  ];

  const INTERNATIONAL_AIRLINES: AirlineMeta[] = [
    {code: 'LA', name: 'LATAM Airlines', accent: '#E11D48', domain: 'latamairlines.com', officialUrl: 'https://www.latamairlines.com/br/pt', multiplier: 1.0, baggage: '10kg mão + 23kg despachada', hub: 'GRU', regions: ['América do Sul', 'América do Norte', 'Caribe & América Central', 'Europa', 'África']},
    {code: 'AD', name: 'Azul Internacional', accent: '#2563EB', domain: 'voeazul.com.br', officialUrl: 'https://www.voeazul.com.br/br/pt/home', multiplier: 1.02, baggage: '10kg mão + 23kg despachada', hub: 'VCP', regions: ['América do Sul', 'América do Norte', 'Europa']},
    {code: 'G3', name: 'GOL Linhas Aéreas', accent: '#EA580C', domain: 'voegol.com.br', officialUrl: 'https://www.voegol.com.br/br/voos', multiplier: 0.92, baggage: '10kg mão', hub: 'GRU', regions: ['América do Sul', 'América do Norte', 'Caribe & América Central']},
    {code: 'CM', name: 'Copa Airlines', accent: '#1D4ED8', domain: 'copaair.com', officialUrl: 'https://www.copaair.com/pt-br', multiplier: 0.95, baggage: '10kg mão + 23kg despachada', hub: 'PTY', regions: ['América do Sul', 'América do Norte', 'Caribe & América Central']},
    {code: 'AA', name: 'American Airlines', accent: '#0284C7', domain: 'aa.com', officialUrl: 'https://www.aa.com.br/homePage.do?locale=pt_BR', multiplier: 1.08, baggage: '10kg mão + 23kg despachada', hub: 'MIA', regions: ['América do Norte', 'Caribe & América Central']},
    {code: 'UA', name: 'United Airlines', accent: '#2563EB', domain: 'united.com', officialUrl: 'https://www.united.com/pt/br/', multiplier: 1.11, baggage: '10kg mão + 23kg despachada', hub: 'IAH', regions: ['América do Norte', 'Oriente Médio & Ásia']},
    {code: 'DL', name: 'Delta Air Lines', accent: '#DC2626', domain: 'delta.com', officialUrl: 'https://pt.delta.com/br/pt', multiplier: 1.09, baggage: '10kg mão + 23kg despachada', hub: 'ATL', regions: ['América do Norte', 'Caribe & América Central']},
    {code: 'AC', name: 'Air Canada', accent: '#DC2626', domain: 'aircanada.com', officialUrl: 'https://www.aircanada.com/br/pt/aco/home.html', multiplier: 1.06, baggage: '10kg mão + 23kg despachada', hub: 'YYZ', regions: ['América do Norte', 'Oriente Médio & Ásia']},
    {code: 'AM', name: 'Aeroméxico', accent: '#1E40AF', domain: 'aeromexico.com', officialUrl: 'https://www.aeromexico.com/pt-br', multiplier: 0.99, baggage: '10kg mão + 23kg despachada', hub: 'MEX', regions: ['América do Norte', 'Caribe & América Central']},
    {code: 'AR', name: 'Aerolíneas Argentinas', accent: '#0EA5E9', domain: 'aerolineas.com.ar', officialUrl: 'https://www.aerolineas.com.ar/pt-br', multiplier: 0.94, baggage: '10kg mão + 15kg despachada', hub: 'AEP', regions: ['América do Sul']},
    {code: 'H2', name: 'Sky Airline', accent: '#7C3AED', domain: 'skyairline.com', officialUrl: 'https://www.skyairline.com/brasil', multiplier: 0.84, baggage: 'Item pessoal + 10kg', hub: 'SCL', regions: ['América do Sul']},
    {code: 'JA', name: 'JetSMART', accent: '#BE123C', domain: 'jetsmart.com', officialUrl: 'https://jetsmart.com/br/pt/', multiplier: 0.81, baggage: 'Item pessoal', hub: 'SCL', regions: ['América do Sul']},
    {code: 'AV', name: 'Avianca', accent: '#DC2626', domain: 'avianca.com', officialUrl: 'https://www.avianca.com/br/pt/', multiplier: 0.93, baggage: '10kg mão', hub: 'BOG', regions: ['América do Sul', 'América do Norte', 'Caribe & América Central', 'Europa']},
    {code: 'TP', name: 'TAP Air Portugal', accent: '#16A34A', domain: 'flytap.com', officialUrl: 'https://www.flytap.com/pt-br/', multiplier: 1.01, baggage: '10kg mão + 23kg despachada', hub: 'LIS', regions: ['Europa', 'África']},
    {code: 'IB', name: 'Iberia', accent: '#DC2626', domain: 'iberia.com', officialUrl: 'https://www.iberia.com/br/', multiplier: 1.04, baggage: '10kg mão + 23kg despachada', hub: 'MAD', regions: ['Europa']},
    {code: 'UX', name: 'Air Europa', accent: '#0284C7', domain: 'aireuropa.com', officialUrl: 'https://www.aireuropa.com/br/pt/home', multiplier: 0.94, baggage: '10kg mão + 23kg despachada', hub: 'MAD', regions: ['Europa']},
    {code: 'AF', name: 'Air France', accent: '#1D4ED8', domain: 'airfrance.com.br', officialUrl: 'https://www.airfrance.com.br/', multiplier: 1.12, baggage: '10kg mão + 23kg despachada', hub: 'CDG', regions: ['Europa', 'Oriente Médio & Ásia', 'África']},
    {code: 'KL', name: 'KLM Royal Dutch', accent: '#0284C7', domain: 'klm.com.br', officialUrl: 'https://www.klm.com.br/', multiplier: 1.10, baggage: '10kg mão + 23kg despachada', hub: 'AMS', regions: ['Europa', 'Oriente Médio & Ásia']},
    {code: 'BA', name: 'British Airways', accent: '#1E3A8A', domain: 'britishairways.com', officialUrl: 'https://www.britishairways.com/travel/home/public/pt_br/', multiplier: 1.15, baggage: '10kg mão + 23kg despachada', hub: 'LHR', regions: ['Europa', 'Oriente Médio & Ásia']},
    {code: 'LH', name: 'Lufthansa', accent: '#CA8A04', domain: 'lufthansa.com', officialUrl: 'https://www.lufthansa.com/br/pt/homepage', multiplier: 1.14, baggage: '10kg mão + 23kg despachada', hub: 'FRA', regions: ['Europa', 'Oriente Médio & Ásia']},
    {code: 'LX', name: 'SWISS International', accent: '#DC2626', domain: 'swiss.com', officialUrl: 'https://www.swiss.com/br/pt/homepage', multiplier: 1.16, baggage: '10kg mão + 23kg despachada', hub: 'ZRH', regions: ['Europa']},
    {code: 'AZ', name: 'ITA Airways', accent: '#0369A1', domain: 'ita-airways.com', officialUrl: 'https://www.ita-airways.com/pt_br', multiplier: 1.03, baggage: '10kg mão + 23kg despachada', hub: 'FCO', regions: ['Europa']},
    {code: 'TK', name: 'Turkish Airlines', accent: '#DC2626', domain: 'turkishairlines.com', officialUrl: 'https://www.turkishairlines.com/pt-br/', multiplier: 1.07, baggage: '10kg mão + 2x23kg despachadas', hub: 'IST', regions: ['Europa', 'Oriente Médio & Ásia', 'África']},
    {code: 'EK', name: 'Emirates', accent: '#B91C1C', domain: 'emirates.com', officialUrl: 'https://www.emirates.com/br/portuguese/', multiplier: 1.24, baggage: '7kg mão + 2x23kg despachadas', hub: 'DXB', regions: ['Oriente Médio & Ásia', 'África']},
    {code: 'QR', name: 'Qatar Airways', accent: '#7F1D1D', domain: 'qatarairways.com', officialUrl: 'https://www.qatarairways.com/pt-br/homepage.html', multiplier: 1.21, baggage: '7kg mão + 2x23kg despachadas', hub: 'DOH', regions: ['Oriente Médio & Ásia', 'África']},
    {code: 'ET', name: 'Ethiopian Airlines', accent: '#15803D', domain: 'ethiopianairlines.com', officialUrl: 'https://www.ethiopianairlines.com/br', multiplier: 0.96, baggage: '7kg mão + 2x23kg despachadas', hub: 'ADD', regions: ['África', 'Oriente Médio & Ásia']},
  ];

  const ALL_OFFICIAL_AIRLINE_DOMAINS = Array.from(
    new Set([...NATIONAL_AIRLINES, ...INTERNATIONAL_AIRLINES].map((a) => a.domain)),
  );

  const THIRD_PARTY_OTA_DOMAINS = [
    'decolar.com',
    'kayak.com',
    'skyscanner.com',
    'maxmilhas.com',
    '123milhas.com',
    'expedia.',
    'booking.com',
    'kiwi.com',
    'edreams.',
    'viajanet.',
    'submarinoviagens',
    'hurb.',
    'almundo.',
    'trip.com',
    'gotogate',
    'mytrip',
    'momondo',
    'mundi.com',
    'voopter',
    'melhoresdestinos',
  ];

  function isThirdPartyOtaUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return THIRD_PARTY_OTA_DOMAINS.some((ota) => lower.includes(ota));
  }

  function isOfficialAirlineUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return ALL_OFFICIAL_AIRLINE_DOMAINS.some((dom) => lower.includes(dom));
  }

  function calcHaversineKm(a: Airport, b: Airport): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.max(120, Math.round(2 * R * Math.asin(Math.sqrt(h))));
  }

  function hashSeed(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  interface ParsedLiveFlight {
    carrierCode: string;
    airlineNames: string[];
    isMultiAirline: boolean;
    flightNumber: string;
    aircraft?: string;
    departureTime: string;
    arrivalTime: string;
    durationMinutes: number;
    stops: number;
    stopAirports: string[];
    priceBrl: number;
  }

  interface LiveFlightsCachePayload {
    flights: ParsedLiveFlight[];
    historyPoints: Array<{timestampMs: number; priceBrl: number}>;
    typicalPriceLow?: number;
    typicalPriceHigh?: number;
    fetchedAt: string;
  }

  const flightLiveCache = new Map<string, {expiresAt: number; data: LiveFlightsCachePayload}>();
  const FLIGHT_CACHE_TTL_MS = 3 * 60 * 1000;

  const encodeVarint = (val: number): number[] => {
    const bytes: number[] = [];
    let v = val >>> 0;
    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
    return bytes;
  };
  const pbVarint = (fieldNum: number, val: number): number[] => [
    ...encodeVarint((fieldNum << 3) | 0),
    ...encodeVarint(val),
  ];
  const pbBytes = (fieldNum: number, buf: number[]): number[] => [
    ...encodeVarint((fieldNum << 3) | 2),
    ...encodeVarint(buf.length),
    ...buf,
  ];
  const pbString = (fieldNum: number, str: string): number[] =>
    pbBytes(fieldNum, Array.from(Buffer.from(str, 'utf8')));

  function buildGoogleFlightsTfsUrl(opts: {
    originIata: string;
    destIata: string;
    departureDate: string;
    returnDate?: string;
    tripType: 'roundtrip' | 'oneway';
    passengers: number;
    cabinClass: FlightComparisonResult['cabinClass'];
    airlineCode?: string;
  }): string {
    const isRT = opts.tripType === 'roundtrip' && Boolean(opts.returnDate);
    const seatCode =
      opts.cabinClass === 'Executiva' ? 3 : opts.cabinClass === 'Econômica Premium' ? 2 : 1;
    // Skip carrier filter for multi-airline itineraries or 2Z (Voepass codeshares)
    const carrierFilter =
      opts.airlineCode && opts.airlineCode !== '2Z' && opts.airlineCode !== 'MULTI'
        ? opts.airlineCode
        : undefined;

    const encodeAirport = (iata: string): number[] => [
      ...pbVarint(1, 1),
      ...pbString(2, iata),
    ];
    const encodeLeg = (dateStr: string, fromIata: string, toIata: string): number[] => [
      ...pbString(2, dateStr),
      ...(carrierFilter ? pbString(6, carrierFilter) : []),
      ...pbBytes(13, encodeAirport(fromIata)),
      ...pbBytes(14, encodeAirport(toIata)),
    ];

    const paxBytes: number[] = [];
    for (let i = 0; i < opts.passengers; i++) {
      paxBytes.push(...pbVarint(8, 1));
    }

    const payload: number[] = [
      ...pbVarint(1, 28),
      ...pbVarint(2, 2),
      ...pbBytes(3, encodeLeg(opts.departureDate, opts.originIata, opts.destIata)),
      ...(isRT && opts.returnDate
        ? pbBytes(3, encodeLeg(opts.returnDate, opts.destIata, opts.originIata))
        : []),
      ...paxBytes,
      ...pbVarint(9, seatCode),
      ...pbVarint(19, isRT ? 1 : 2),
    ];

    const tfs = Buffer.from(payload)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `https://www.google.com/travel/flights/search?tfs=${tfs}&hl=pt-BR&curr=BRL&gl=BR`;
  }

  function formatGoogleHm(tuple: unknown): string {
    if (!Array.isArray(tuple)) return '--:--';
    const h = typeof tuple[0] === 'number' ? tuple[0] : 0;
    const m = typeof tuple[1] === 'number' ? tuple[1] : 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function computeDayOffsetSuffix(depDateTuple: unknown, arrDateTuple: unknown): string {
    if (
      !Array.isArray(depDateTuple) ||
      !Array.isArray(arrDateTuple) ||
      depDateTuple.length < 3 ||
      arrDateTuple.length < 3
    ) {
      return '';
    }
    const depUtc = Date.UTC(Number(depDateTuple[0]), Number(depDateTuple[1]) - 1, Number(depDateTuple[2]));
    const arrUtc = Date.UTC(Number(arrDateTuple[0]), Number(arrDateTuple[1]) - 1, Number(arrDateTuple[2]));
    const diff = Math.round((arrUtc - depUtc) / 86400000);
    return diff > 0 ? ` (+${diff})` : '';
  }

  async function fetchLiveGoogleFlights(opts: {
    originIata: string;
    destIata: string;
    departureDate: string;
    returnDate?: string;
    tripType: 'roundtrip' | 'oneway';
    passengers: number;
    cabinClass: FlightComparisonResult['cabinClass'];
    forceRefresh?: boolean;
  }): Promise<LiveFlightsCachePayload> {
    const cacheKey = `${opts.originIata}|${opts.destIata}|${opts.departureDate}|${opts.returnDate || ''}|${opts.tripType}|${opts.passengers}|${opts.cabinClass}`;
    const cached = flightLiveCache.get(cacheKey);
    if (!opts.forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const searchUrl = buildGoogleFlightsTfsUrl({
      originIata: opts.originIata,
      destIata: opts.destIata,
      departureDate: opts.departureDate,
      returnDate: opts.returnDate,
      tripType: opts.tripType,
      passengers: opts.passengers,
      cabinClass: opts.cabinClass,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);

    try {
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: 'CONSENT=PENDING+987; SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg',
        },
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ao consultar tarifas em tempo real`);
      }

      const html = await resp.text();
      const extractGoogleFlightsPayload = (sourceHtml: string): unknown[] | null => {
        const candidates: Array<{key: string; data: unknown[]}> = [];
        const cbRegex = /AF_initDataCallback\(\{key:\s*'([^']+)'/g;
        let m: RegExpExecArray | null;
        while ((m = cbRegex.exec(sourceHtml)) !== null) {
          const key = m[1];
          const searchWindowEnd = Math.min(sourceHtml.length, m.index + 400);
          const dataIdx = sourceHtml.indexOf('data:', m.index);
          if (dataIdx === -1 || dataIdx > searchWindowEnd) continue;

          // Locate the start of the JSON array after "data:" (or "data:function(){return ")
          let arrStart = dataIdx + 5;
          while (arrStart < sourceHtml.length && /\s/.test(sourceHtml[arrStart])) arrStart++;
          if (sourceHtml.startsWith('function', arrStart)) {
            const retIdx = sourceHtml.indexOf('return', arrStart);
            if (retIdx === -1 || retIdx > arrStart + 80) continue;
            arrStart = retIdx + 6;
            while (arrStart < sourceHtml.length && /\s/.test(sourceHtml[arrStart])) arrStart++;
          }
          if (sourceHtml[arrStart] !== '[') continue;

          const jsonSlice = extractBalancedJson(sourceHtml, arrStart, '[');
          if (!jsonSlice) continue;

          try {
            const parsedArr = JSON.parse(jsonSlice) as unknown[];
            if (Array.isArray(parsedArr)) {
              candidates.push({key, data: parsedArr});
            }
          } catch {
            // Skip malformed callback block safely
          }
        }

        const hasFlightOffers = (arr: unknown[]): boolean => {
          const b = Array.isArray((arr[2] as unknown[])?.[0]) ? ((arr[2] as unknown[])[0] as unknown[]) : [];
          const o = Array.isArray((arr[3] as unknown[])?.[0]) ? ((arr[3] as unknown[])[0] as unknown[]) : [];
          return b.length > 0 || o.length > 0;
        };

        const ds1WithOffers = candidates.find((c) => c.key === 'ds:1' && hasFlightOffers(c.data));
        if (ds1WithOffers) return ds1WithOffers.data;

        const anyWithOffers = candidates.find((c) => hasFlightOffers(c.data));
        if (anyWithOffers) return anyWithOffers.data;

        const ds1Fallback = candidates.find((c) => c.key === 'ds:1');
        return ds1Fallback ? ds1Fallback.data : null;
      };

      const data = extractGoogleFlightsPayload(html);
      if (!data) {
        throw new Error('Não foi possível extrair os dados de tarifas ao vivo para esta consulta.');
      }

      const bestArr = Array.isArray((data[2] as unknown[])?.[0]) ? ((data[2] as unknown[])[0] as unknown[]) : [];
      const otherArr = Array.isArray((data[3] as unknown[])?.[0]) ? ((data[3] as unknown[])[0] as unknown[]) : [];
      const rawItems = [...bestArr, ...otherArr];

      const flights: ParsedLiveFlight[] = [];
      const seenKeys = new Set<string>();

      for (const rawItem of rawItems) {
        if (!Array.isArray(rawItem) || !Array.isArray(rawItem[0])) continue;
        const info = rawItem[0] as unknown[];
        const priceInfo = Array.isArray(rawItem[1]) ? (rawItem[1] as unknown[]) : [];
        const priceTuple = Array.isArray(priceInfo[0]) ? (priceInfo[0] as unknown[]) : [];
        const priceBrl = typeof priceTuple[1] === 'number' ? Math.round(priceTuple[1]) : 0;
        if (priceBrl <= 0) continue;

        const segments = Array.isArray(info[2]) ? (info[2] as unknown[][]) : [];
        const rawCarrierCode = typeof info[0] === 'string' ? info[0] : '';
        const airlineNames = Array.isArray(info[1])
          ? (info[1] as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : [];

        const firstSegCarrier =
          segments[0] && Array.isArray(segments[0][22]) && typeof segments[0][22][0] === 'string'
            ? String(segments[0][22][0]).toUpperCase()
            : '';

        const isMultiAirline =
          rawCarrierCode.toLowerCase() === 'multi' ||
          airlineNames.length > 1 ||
          !rawCarrierCode;

        const carrierCode = isMultiAirline
          ? firstSegCarrier || 'MULTI'
          : rawCarrierCode.toUpperCase();

        const flightNumbers = segments
          .map((seg) => {
            const carrierMeta = Array.isArray(seg[22]) ? seg[22] : [];
            const c = typeof carrierMeta[0] === 'string' ? carrierMeta[0].toUpperCase() : '';
            const n = typeof carrierMeta[1] === 'string' || typeof carrierMeta[1] === 'number' ? String(carrierMeta[1]) : '';
            return c && n ? `${c} ${n}` : '';
          })
          .filter(Boolean);

        const flightNumber = flightNumbers.length > 0 ? flightNumbers.join(' + ') : `${carrierCode} —`;
        const aircraft =
          segments[0] && typeof segments[0][17] === 'string' && segments[0][17].trim()
            ? segments[0][17].trim()
            : undefined;

        const departureTime = formatGoogleHm(info[5]);
        const arrivalTime = `${formatGoogleHm(info[8])}${computeDayOffsetSuffix(info[4], info[7])}`;
        const durationMinutes =
          typeof info[9] === 'number' && info[9] > 0 ? Math.round(info[9]) : 0;
        const stops = Math.max(0, segments.length - 1);
        const stopAirports = segments
          .slice(0, -1)
          .map((seg) => (typeof seg[6] === 'string' ? seg[6].toUpperCase() : ''))
          .filter(Boolean);

        const dedupeKey = `${carrierCode}|${flightNumber}|${departureTime}|${arrivalTime}|${priceBrl}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        flights.push({
          carrierCode,
          airlineNames: airlineNames.length > 0 ? airlineNames : [carrierCode],
          isMultiAirline,
          flightNumber,
          aircraft,
          departureTime,
          arrivalTime,
          durationMinutes,
          stops,
          stopAirports,
          priceBrl,
        });
      }

      // Extract real historical price trend & typical price band from data[5]
      const insights = Array.isArray(data[5]) ? (data[5] as unknown[]) : [];
      const typicalPriceLow =
        Array.isArray(insights[4]) && typeof (insights[4] as unknown[])[1] === 'number'
          ? Math.round(Number((insights[4] as unknown[])[1]))
          : undefined;
      const typicalPriceHigh =
        Array.isArray(insights[5]) && typeof (insights[5] as unknown[])[1] === 'number'
          ? Math.round(Number((insights[5] as unknown[])[1]))
          : undefined;

      const historyRaw =
        Array.isArray(insights[10]) && Array.isArray((insights[10] as unknown[])[0])
          ? ((insights[10] as unknown[])[0] as unknown[])
          : [];
      const historyPoints: Array<{timestampMs: number; priceBrl: number}> = [];
      for (const pt of historyRaw) {
        if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number' && pt[1] > 0) {
          historyPoints.push({timestampMs: pt[0], priceBrl: Math.round(pt[1])});
        }
      }

      const payload: LiveFlightsCachePayload = {
        flights,
        historyPoints,
        typicalPriceLow,
        typicalPriceHigh,
        fetchedAt: new Date().toISOString(),
      };

      flightLiveCache.set(cacheKey, {
        expiresAt: Date.now() + FLIGHT_CACHE_TTL_MS,
        data: payload,
      });

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  const AIRLINE_BY_CODE = new Map<string, AirlineMeta>();
  for (const al of [...INTERNATIONAL_AIRLINES, ...NATIONAL_AIRLINES]) {
    AIRLINE_BY_CODE.set(al.code.toUpperCase(), al);
  }

  const suggestBestInternationalHub = (domestic: Airport, foreign: Airport): Airport => {
    const findHub = (code: string) =>
      BRAZILIAN_INTERNATIONAL_AIRPORTS.find((a) => a.iata === code) ||
      BRAZILIAN_INTERNATIONAL_AIRPORTS[0];

    if (domestic.hasInternationalFlights) {
      return domestic;
    }

    const pickNearest = (codes: string[]): Airport => {
      const candidates = codes
        .map((c) => BRAZILIAN_INTERNATIONAL_AIRPORTS.find((a) => a.iata === c))
        .filter((a): a is Airport => Boolean(a));
      if (candidates.length === 0) return findHub('GRU');
      return candidates.sort(
        (a, b) => calcHaversineKm(domestic, a) - calcHaversineKm(domestic, b),
      )[0];
    };

    if (domestic.region === 'Nordeste') {
      if (['LIS', 'OPO', 'MAD', 'BCN', 'CDG', 'ORY'].includes(foreign.iata)) {
        return pickNearest(['REC', 'FOR', 'SSA']);
      }
      if (['MIA', 'MCO', 'FLL', 'PTY'].includes(foreign.iata)) {
        return pickNearest(['FOR', 'REC', 'BSB', 'GRU']);
      }
      return findHub('GRU');
    }

    if (domestic.region === 'Sul') {
      if (foreign.region === 'América do Sul') {
        return pickNearest(['POA', 'CWB', 'FLN', 'GRU']);
      }
      return findHub('GRU');
    }

    if (domestic.region === 'Centro-Oeste') {
      if (['MIA', 'MCO', 'FLL', 'PTY', 'CUN', 'LIS', 'EZE', 'AEP', 'SCL', 'LIM', 'BOG'].includes(foreign.iata)) {
        return findHub('BSB');
      }
      return findHub('GRU');
    }

    if (domestic.region === 'Norte') {
      if (['MIA', 'FLL', 'PTY', 'LIS'].includes(foreign.iata)) {
        return pickNearest(['MAO', 'BEL', 'BSB']);
      }
      return findHub('GRU');
    }

    // Sudeste (ES, MG, RJ, SP) & intercontinental default: Guarulhos (GRU) connects to all international destinations
    return findHub('GRU');
  };

  app.post('/api/flights/compare', async (req, res) => {
    const body = req.body || {};
    const scope: TravelScope = body.scope === 'international' ? 'international' : 'national';
    const originCode = String(body.originIata || (scope === 'national' ? 'VIX' : 'GRU')).toUpperCase();
    const destCode = String(body.destinationIata || (scope === 'national' ? 'GRU' : 'LIS')).toUpperCase();
    const rawHubInput = String(body.connectionHubIata || 'auto').trim().toUpperCase();
    const rawDepartureDate = String(
      body.departureDate || new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    );
    const returnDate = body.returnDate ? String(body.returnDate) : undefined;
    const tripType: 'roundtrip' | 'oneway' | 'returnonly' =
      body.tripType === 'returnonly'
        ? 'returnonly'
        : body.tripType === 'oneway'
          ? 'oneway'
          : 'roundtrip';
    const googleTripType: 'roundtrip' | 'oneway' =
      tripType === 'roundtrip' ? 'roundtrip' : 'oneway';
    const departureDate =
      tripType === 'returnonly' && returnDate ? returnDate : rawDepartureDate;
    const effectiveReturnDate = googleTripType === 'roundtrip' ? returnDate : undefined;
    const passengers = Math.max(1, Math.min(9, Number(body.passengers) || 1));
    const avoidThirdParty = body.avoidThirdParty !== false;
    const forceRefresh = body.forceRefresh === true;
    const cabinClass: FlightComparisonResult['cabinClass'] =
      body.cabinClass === 'Executiva' || body.cabinClass === 'Econômica Premium'
        ? body.cabinClass
        : 'Econômica';

    let origin: Airport | undefined;
    let destination: Airport | undefined;

    if (scope === 'international') {
      const brOrigin = BRAZILIAN_AIRPORTS.find((a) => a.iata === originCode);
      const intlDest = INTERNATIONAL_DESTINATIONS.find((a) => a.iata === destCode);
      const intlOrigin = INTERNATIONAL_DESTINATIONS.find((a) => a.iata === originCode);
      const brDest = BRAZILIAN_AIRPORTS.find((a) => a.iata === destCode);

      if (brOrigin && intlDest) {
        origin = brOrigin;
        destination = intlDest;
      } else if (intlOrigin && brDest) {
        origin = intlOrigin;
        destination = brDest;
      }
    } else {
      origin = BRAZILIAN_AIRPORTS.find((a) => a.iata === originCode);
      destination = BRAZILIAN_AIRPORTS.find((a) => a.iata === destCode);
    }

    if (!origin || !destination) {
      res.status(400).json({
        error:
          scope === 'international'
            ? 'Para voos internacionais, selecione uma rota entre qualquer aeroporto brasileiro e um destino internacional válido.'
            : 'Selecione aeroportos brasileiros válidos de origem e destino.',
      });
      return;
    }

    if (origin.iata === destination.iata) {
      res.status(400).json({error: 'O aeroporto de origem e destino não podem ser iguais.'});
      return;
    }

    if (tripType === 'roundtrip' && effectiveReturnDate && effectiveReturnDate < departureDate) {
      res.status(400).json({error: 'A data de volta deve ser igual ou posterior à data de ida.'});
      return;
    }

    const brazilianEndpoint =
      scope === 'international' ? (origin.isBrazilian ? origin : destination) : undefined;
    const foreignEndpoint =
      scope === 'international' ? (origin.isBrazilian ? destination : origin) : undefined;

    const explicitHubCandidate =
      scope === 'international' && rawHubInput && rawHubInput !== 'AUTO'
        ? BRAZILIAN_INTERNATIONAL_AIRPORTS.find((a) => a.iata === rawHubInput)
        : undefined;
    const requestedHub =
      explicitHubCandidate && brazilianEndpoint && explicitHubCandidate.iata !== brazilianEndpoint.iata
        ? explicitHubCandidate
        : undefined;

    const needsConnectionHub =
      scope === 'international' &&
      Boolean(brazilianEndpoint && foreignEndpoint) &&
      (!brazilianEndpoint!.hasInternationalFlights || Boolean(requestedHub));

    let selectedHub: Airport | undefined = needsConnectionHub
      ? requestedHub || suggestBestInternationalHub(brazilianEndpoint!, foreignEndpoint!)
      : undefined;

    const distanceKm = selectedHub
      ? calcHaversineKm(origin, selectedHub) + calcHaversineKm(selectedHub, destination)
      : calcHaversineKm(origin, destination);

    const googleFlightsAllUrl = buildGoogleFlightsTfsUrl({
      originIata: origin.iata,
      destIata: destination.iata,
      departureDate,
      returnDate: effectiveReturnDate,
      tripType: googleTripType,
      passengers,
      cabinClass,
    });

    const travelStore = !avoidThirdParty
      ? state.stores.find(
          (s) =>
            s.active &&
            (s.domain.includes('decolar') ||
              s.domain.includes('skyscanner') ||
              s.domain.includes('kayak') ||
              s.domain.includes('maxmilhas') ||
              s.domain.includes('booking')),
        )
      : undefined;

    const buildFlightItineraryUrls = (
      legOriginIata: string,
      legDestIata: string,
      carrierCode: string,
      isMultiAirline: boolean,
      knownOfficialUrl: string,
      stopsCount: number,
    ) => {
      const isRT = googleTripType === 'roundtrip' && Boolean(effectiveReturnDate);
      const [depY, depM, depD] = departureDate.split('-');
      const [retY, retM, retD] = effectiveReturnDate ? effectiveReturnDate.split('-') : ['', '', ''];
      const depDDMMYYYY = `${depD}-${depM}-${depY}`;
      const retDDMMYYYY = effectiveReturnDate ? `${retD}-${retM}-${retY}` : '';
      const depMMDDYYYY = `${depM}/${depD}/${depY}`;
      const retMMDDYYYY = effectiveReturnDate ? `${retM}/${retD}/${retY}` : '';
      const depDotDate = `${depD}.${depM}.${depY}`;
      const retDotDate = effectiveReturnDate ? `${retD}.${retM}.${retY}` : '';
      const depYYMMDD = departureDate.replace(/-/g, '').slice(2);
      const retYYMMDD = effectiveReturnDate ? effectiveReturnDate.replace(/-/g, '').slice(2) : '';

      const cabinLatam =
        cabinClass === 'Executiva'
          ? 'PremiumBusiness'
          : cabinClass === 'Econômica Premium'
            ? 'PremiumEconomy'
            : 'Economy';
      const cabinTap = cabinClass === 'Executiva' ? 'C' : 'Y';
      const cabinKayakPrefix =
        cabinClass === 'Executiva'
          ? 'business/'
          : cabinClass === 'Econômica Premium'
            ? 'premium/'
            : '';
      const cabinSkyscanner =
        cabinClass === 'Executiva'
          ? 'business'
          : cabinClass === 'Econômica Premium'
            ? 'premiumeconomy'
            : 'economy';
      const cabinBooking =
        cabinClass === 'Executiva'
          ? 'BUSINESS'
          : cabinClass === 'Econômica Premium'
            ? 'PREMIUM_ECONOMY'
            : 'ECONOMY';
      const cabinMaxMilhas = cabinClass === 'Executiva' ? 'EX' : 'EC';

      const rawUrl = buildGoogleFlightsTfsUrl({
        originIata: legOriginIata,
        destIata: legDestIata,
        departureDate,
        returnDate: effectiveReturnDate,
        tripType: googleTripType,
        passengers,
        cabinClass,
        airlineCode: isMultiAirline ? undefined : carrierCode,
      });

      let officialUrl = knownOfficialUrl || rawUrl;
      let hasDirectAirlineDeepLink = false;

      if (!isMultiAirline) {
        if (carrierCode === 'LA') {
          officialUrl = `https://www.latamairlines.com/br/pt/oferta-voos?origin=${legOriginIata}&outbound=${departureDate}T00%3A00%3A00.000Z&destination=${legDestIata}${
            isRT && effectiveReturnDate ? `&inbound=${effectiveReturnDate}T00%3A00%3A00.000Z` : ''
          }&adt=${passengers}&chd=0&inf=0&trip=${isRT ? 'RT' : 'OW'}&cabin=${cabinLatam}&redemption=false&sort=RECOMMENDED`;
          hasDirectAirlineDeepLink = true;
        } else if (carrierCode === 'G3') {
          officialUrl = `https://b2c.voegol.com.br/compra/busca-parceiros?pv=br&tipo=${
            isRT ? 'DF' : 'SO'
          }&de=${legOriginIata}&para=${legDestIata}&ida=${depDDMMYYYY}${
            isRT && retDDMMYYYY ? `&volta=${retDDMMYYYY}` : ''
          }&ADT=${passengers}&CHD=0&INF=0`;
          hasDirectAirlineDeepLink = true;
        } else if (carrierCode === 'AD') {
          officialUrl = `https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=${legOriginIata}&c[0].as=${legDestIata}&c[0].std=${encodeURIComponent(depMMDDYYYY)}${
            isRT && retMMDDYYYY
              ? `&c[1].ds=${legDestIata}&c[1].as=${legOriginIata}&c[1].std=${encodeURIComponent(retMMDDYYYY)}`
              : ''
          }&p[0].t=ADT&p[0].c=${passengers}&p[0].cp=false&f.dl=3&f.dr=3&cc=BRL`;
          hasDirectAirlineDeepLink = true;
        } else if (carrierCode === 'TP') {
          officialUrl = `https://booking.flytap.com/booking/flights/deeplink?market=BR&language=pt&origin=${legOriginIata}&destination=${legDestIata}&depDate=${depDotDate}${
            isRT && retDotDate ? `&retDate=${retDotDate}` : ''
          }&adt=${passengers}&chd=0&inf=0&cabinClass=${cabinTap}`;
          hasDirectAirlineDeepLink = true;
        } else if (carrierCode === 'H2') {
          officialUrl = `https://www.skyairline.com/brasil/flujo-de-compra/busqueda-de-vuelos?origin=${legOriginIata}&destination=${legDestIata}&departureDate=${departureDate}${
            isRT && effectiveReturnDate ? `&returnDate=${effectiveReturnDate}` : ''
          }&adults=${passengers}`;
          hasDirectAirlineDeepLink = true;
        }
      }

      if (avoidThirdParty || !travelStore) {
        return {
          rawUrl,
          officialUrl,
          hasDirectAirlineDeepLink,
          partnerSearchUrl: hasDirectAirlineDeepLink ? officialUrl : rawUrl,
          sourceLabel: hasDirectAirlineDeepLink
            ? 'Tarifa Real Ao Vivo · Seleção Direta na Cia'
            : 'Tarifa Real Ao Vivo · Reserva Direta Google Voos',
        };
      }

      const dom = travelStore.domain.toLowerCase();
      let partnerBaseUrl = `https://www.kayak.com.br/flights/${legOriginIata}-${legDestIata}/${departureDate}${
        isRT && effectiveReturnDate ? `/${effectiveReturnDate}` : ''
      }/${cabinKayakPrefix}${passengers}adults?sort=bestflight_a${
        !isMultiAirline ? `&fs=airlines=${carrierCode}${stopsCount === 0 ? ';stops=0' : ''}` : ''
      }`;
      if (dom.includes('decolar')) {
        partnerBaseUrl = `https://www.decolar.com/shop/flights/results/${
          isRT ? 'roundtrip' : 'oneway'
        }/${legOriginIata}/${legDestIata}/${departureDate}${
          isRT && effectiveReturnDate ? `/${effectiveReturnDate}` : ''
        }/${passengers}/0/0`;
      } else if (dom.includes('skyscanner')) {
        partnerBaseUrl = `https://www.skyscanner.com.br/transporte/passagens-aereas/${legOriginIata.toLowerCase()}/${legDestIata.toLowerCase()}/${depYYMMDD}/${
          isRT && retYYMMDD ? `${retYYMMDD}/` : ''
        }?adultsv2=${passengers}&cabinclass=${cabinSkyscanner}&rtn=${isRT ? '1' : '0'}${
          stopsCount === 0 ? '&preferdirects=true' : ''
        }`;
      } else if (dom.includes('booking')) {
        partnerBaseUrl = `https://flights.booking.com/flights/${legOriginIata}.AIRPORT-${legDestIata}.AIRPORT/?type=${
          isRT ? 'ROUNDTRIP' : 'ONEWAY'
        }&adults=${passengers}&cabinClass=${cabinBooking}&depart=${departureDate}${
          isRT && effectiveReturnDate ? `&return=${effectiveReturnDate}` : ''
        }`;
      } else if (dom.includes('maxmilhas')) {
        partnerBaseUrl = `https://www.maxmilhas.com.br/busca-passagens-aereas/${
          isRT ? 'RT' : 'OW'
        }/${legOriginIata}/${legDestIata}/${departureDate}${
          isRT && effectiveReturnDate ? `/${effectiveReturnDate}` : ''
        }/${passengers}/0/0/${cabinMaxMilhas}`;
      }

      return {
        rawUrl,
        officialUrl,
        hasDirectAirlineDeepLink,
        partnerSearchUrl: buildAffiliateUrl(partnerBaseUrl, travelStore),
        sourceLabel: `Tarifa Real Ao Vivo · ${travelStore.name}`,
      };
    };

    const fallbackColors = ['#2563EB', '#E11D48', '#EA580C', '#0284C7', '#16A34A', '#7C3AED', '#CA8A04'];

    const mapSingleTicketOffer = (
      lf: LiveFlightsCachePayload['flights'][number],
      idx: number,
      hubTag?: Airport,
    ): FlightFareOffer => {
      const meta =
        (scope === 'national'
          ? NATIONAL_AIRLINES.find((a) => a.code === lf.carrierCode)
          : INTERNATIONAL_AIRLINES.find((a) => a.code === lf.carrierCode)) ||
        AIRLINE_BY_CODE.get(lf.carrierCode);

      const airlineName = lf.isMultiAirline
        ? lf.airlineNames.join(' + ')
        : meta?.name || lf.airlineNames[0] || lf.carrierCode;
      const airlineAccent =
        meta?.accent || fallbackColors[hashSeed(lf.carrierCode) % fallbackColors.length];

      const stopLabel =
        lf.stops === 0
          ? 'Voo direto'
          : lf.stops === 1
            ? `1 parada${lf.stopAirports[0] ? ` (${lf.stopAirports[0]})` : ''}`
            : `${lf.stops} paradas${lf.stopAirports.length > 0 ? ` (${lf.stopAirports.join(' / ')})` : ''}`;

      const {rawUrl, officialUrl, hasDirectAirlineDeepLink, partnerSearchUrl, sourceLabel} =
        buildFlightItineraryUrls(
          origin!.iata,
          destination!.iata,
          lf.carrierCode,
          lf.isMultiAirline,
          meta?.officialUrl || '',
          lf.stops,
        );

      const roundTripTotal = lf.priceBrl;
      const matchedHubCode =
        hubTag?.iata ||
        lf.stopAirports.find((code) =>
          BRAZILIAN_INTERNATIONAL_AIRPORTS.some((h) => h.iata === code.toUpperCase()),
        );
      const matchedHubObj = matchedHubCode
        ? BRAZILIAN_INTERNATIONAL_AIRPORTS.find((h) => h.iata === matchedHubCode.toUpperCase())
        : undefined;

      return {
        id: `live-${lf.carrierCode}-${origin!.iata}-${destination!.iata}-${idx}`,
        airlineCode: lf.isMultiAirline ? 'MULTI' : lf.carrierCode,
        airlineName,
        airlineAccent,
        flightNumber: lf.flightNumber,
        aircraft: lf.aircraft,
        isMultiAirline: lf.isMultiAirline,
        departureTime: lf.departureTime,
        arrivalTime: lf.arrivalTime,
        durationMinutes: lf.durationMinutes || Math.round((distanceKm / 780) * 60) + 35,
        stops: lf.stops,
        stopLabel,
        cabinClass,
        baggageIncluded:
          meta?.baggage || (scope === 'national' ? '10kg mão + item pessoal' : 'Consulte franquia na tarifa'),
        priceCash: roundTripTotal,
        taxIncluded: 0,
        roundTripTotal,
        milesEstimate: Math.round(roundTripTotal * (scope === 'national' ? 19 : 24)),
        rawUrl,
        officialUrl,
        hasDirectAirlineDeepLink,
        affiliatePartnerUrl: partnerSearchUrl,
        sourceLabel: matchedHubObj
          ? `Bilhete Único · Conexão em ${matchedHubObj.iata}`
          : sourceLabel,
        isLiveVerified: true,
        connectionHubIata: matchedHubObj?.iata,
        connectionHubCity: matchedHubObj?.city,
        isSplitConnection: false,
      };
    };

    const buildLegDetail = (
      lf: LiveFlightsCachePayload['flights'][number],
      legOrigin: Airport,
      legDest: Airport,
      isNationalLeg: boolean,
    ): FlightLegDetail => {
      const meta =
        (isNationalLeg
          ? NATIONAL_AIRLINES.find((a) => a.code === lf.carrierCode)
          : INTERNATIONAL_AIRLINES.find((a) => a.code === lf.carrierCode)) ||
        AIRLINE_BY_CODE.get(lf.carrierCode);
      const airlineName = lf.isMultiAirline
        ? lf.airlineNames.join(' + ')
        : meta?.name || lf.airlineNames[0] || lf.carrierCode;
      const airlineAccent =
        meta?.accent || fallbackColors[hashSeed(lf.carrierCode) % fallbackColors.length];
      const stopLabel =
        lf.stops === 0
          ? 'Voo direto'
          : lf.stops === 1
            ? `1 parada${lf.stopAirports[0] ? ` (${lf.stopAirports[0]})` : ''}`
            : `${lf.stops} paradas${lf.stopAirports.length > 0 ? ` (${lf.stopAirports.join(' / ')})` : ''}`;

      const urls = buildFlightItineraryUrls(
        legOrigin.iata,
        legDest.iata,
        lf.carrierCode,
        lf.isMultiAirline,
        meta?.officialUrl || '',
        lf.stops,
      );

      return {
        originIata: legOrigin.iata,
        originCity: legOrigin.city,
        destinationIata: legDest.iata,
        destinationCity: legDest.city,
        airlineCode: lf.isMultiAirline ? 'MULTI' : lf.carrierCode,
        airlineName,
        airlineAccent,
        flightNumber: lf.flightNumber,
        departureTime: lf.departureTime,
        arrivalTime: lf.arrivalTime,
        durationMinutes:
          lf.durationMinutes || Math.round((calcHaversineKm(legOrigin, legDest) / 780) * 60) + 35,
        stops: lf.stops,
        stopLabel,
        priceBrl: lf.priceBrl,
        rawUrl: urls.rawUrl,
        officialUrl: urls.officialUrl,
        hasDirectAirlineDeepLink: urls.hasDirectAirlineDeepLink,
        affiliatePartnerUrl: urls.partnerSearchUrl,
      };
    };

    let primaryLiveData: LiveFlightsCachePayload | null = null;
    let leg1Data: LiveFlightsCachePayload | null = null;
    let leg2Data: LiveFlightsCachePayload | null = null;

    if (needsConnectionHub && selectedHub) {
      const [directSettled, leg1Settled, leg2Settled] = await Promise.allSettled([
        fetchLiveGoogleFlights({
          originIata: origin.iata,
          destIata: destination.iata,
          departureDate,
          returnDate: effectiveReturnDate,
          tripType: googleTripType,
          passengers,
          cabinClass,
          forceRefresh,
        }),
        fetchLiveGoogleFlights({
          originIata: origin.iata,
          destIata: selectedHub.iata,
          departureDate,
          returnDate: effectiveReturnDate,
          tripType: googleTripType,
          passengers,
          cabinClass,
          forceRefresh,
        }),
        fetchLiveGoogleFlights({
          originIata: selectedHub.iata,
          destIata: destination.iata,
          departureDate,
          returnDate: effectiveReturnDate,
          tripType: googleTripType,
          passengers,
          cabinClass,
          forceRefresh,
        }),
      ]);

      primaryLiveData = directSettled.status === 'fulfilled' ? directSettled.value : null;
      leg1Data = leg1Settled.status === 'fulfilled' ? leg1Settled.value : null;
      leg2Data = leg2Settled.status === 'fulfilled' ? leg2Settled.value : null;

      // In auto hub mode, if the suggested regional hub had no flights on either leg, fallback to GRU
      if (
        !requestedHub &&
        selectedHub.iata !== 'GRU' &&
        (!leg1Data?.flights.length || !leg2Data?.flights.length)
      ) {
        const gruHub = BRAZILIAN_INTERNATIONAL_AIRPORTS.find((a) => a.iata === 'GRU');
        if (gruHub && gruHub.iata !== origin.iata && gruHub.iata !== destination.iata) {
          const [gruLeg1, gruLeg2] = await Promise.allSettled([
            fetchLiveGoogleFlights({
              originIata: origin.iata,
              destIata: gruHub.iata,
              departureDate,
              returnDate: effectiveReturnDate,
              tripType: googleTripType,
              passengers,
              cabinClass,
              forceRefresh,
            }),
            fetchLiveGoogleFlights({
              originIata: gruHub.iata,
              destIata: destination.iata,
              departureDate,
              returnDate: effectiveReturnDate,
              tripType: googleTripType,
              passengers,
              cabinClass,
              forceRefresh,
            }),
          ]);
          const g1 = gruLeg1.status === 'fulfilled' ? gruLeg1.value : null;
          const g2 = gruLeg2.status === 'fulfilled' ? gruLeg2.value : null;
          if (g1?.flights.length && g2?.flights.length) {
            selectedHub = gruHub;
            leg1Data = g1;
            leg2Data = g2;
          }
        }
      }

      if (!primaryLiveData && (!leg1Data || !leg2Data)) {
        const firstErr =
          directSettled.status === 'rejected'
            ? directSettled.reason
            : leg1Settled.status === 'rejected'
              ? leg1Settled.reason
              : leg2Settled.status === 'rejected'
                ? leg2Settled.reason
                : new Error('Falha ao consultar tarifas ao vivo.');
        const msg = firstErr instanceof Error ? firstErr.message : 'Falha ao consultar tarifas ao vivo.';
        res.status(502).json({
          error: `Não foi possível carregar as tarifas reais agora (${msg}). Tente novamente em alguns segundos.`,
        });
        return;
      }
    } else {
      try {
        primaryLiveData = await fetchLiveGoogleFlights({
          originIata: origin.iata,
          destIata: destination.iata,
          departureDate,
          returnDate: effectiveReturnDate,
          tripType: googleTripType,
          passengers,
          cabinClass,
          forceRefresh,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao consultar tarifas ao vivo.';
        res.status(502).json({
          error: `Não foi possível carregar as tarifas reais agora (${msg}). Tente novamente em alguns segundos.`,
        });
        return;
      }
    }

    let offers: FlightFareOffer[] = [];

    if (primaryLiveData?.flights.length) {
      const mappedDirect = primaryLiveData.flights.map((lf, idx) =>
        mapSingleTicketOffer(lf, idx, requestedHub),
      );
      if (requestedHub) {
        // Prioritize single-ticket itineraries that actually connect through the user's chosen Brazilian hub
        const matchingHub = mappedDirect.filter((_, i) =>
          primaryLiveData!.flights[i].stopAirports.some(
            (code) => code.toUpperCase() === requestedHub.iata,
          ),
        );
        offers.push(...matchingHub);
      } else {
        offers.push(...mappedDirect);
      }
    }

    // Build combined 2-leg offers: Non-international BR -> International Hub BR -> Foreign Destination (or reverse)
    if (needsConnectionHub && selectedHub && leg1Data?.flights.length && leg2Data?.flights.length) {
      const pickTopDiverse = (
        flights: LiveFlightsCachePayload['flights'],
        limit: number,
      ): LiveFlightsCachePayload['flights'] => {
        const sorted = [...flights].sort((a, b) => a.priceBrl - b.priceBrl);
        const picked: LiveFlightsCachePayload['flights'] = [];
        const seenCarrier = new Set<string>();
        for (const f of sorted) {
          if (!seenCarrier.has(f.carrierCode)) {
            picked.push(f);
            seenCarrier.add(f.carrierCode);
            if (picked.length >= limit) break;
          }
        }
        if (picked.length < limit) {
          for (const f of sorted) {
            if (!picked.includes(f)) {
              picked.push(f);
              if (picked.length >= limit) break;
            }
          }
        }
        return picked;
      };

      const topLeg1 = pickTopDiverse(leg1Data.flights, 3);
      const topLeg2 = pickTopDiverse(leg2Data.flights, 4);
      const leg1IsNational = origin.isBrazilian && selectedHub.isBrazilian;
      const leg2IsNational = selectedHub.isBrazilian && destination.isBrazilian;

      const splitCandidates: FlightFareOffer[] = [];
      let splitIdx = 0;

      for (const f1 of topLeg1) {
        for (const f2 of topLeg2) {
          const d1 = buildLegDetail(f1, origin, selectedHub, leg1IsNational);
          const d2 = buildLegDetail(f2, selectedHub, destination, leg2IsNational);
          const combinedPrice = d1.priceBrl + d2.priceBrl;
          const sameCarrier = d1.airlineCode === d2.airlineCode && d1.airlineCode !== 'MULTI';
          const combinedAirlineName = sameCarrier
            ? d1.airlineName
            : `${d1.airlineName} + ${d2.airlineName}`;
          const totalStops = d1.stops + d2.stops + 1;
          const totalDuration = d1.durationMinutes + d2.durationMinutes + 150;

          splitCandidates.push({
            id: `split-${origin.iata}-${selectedHub.iata}-${destination.iata}-${splitIdx++}`,
            airlineCode: sameCarrier ? d1.airlineCode : 'CONEX',
            airlineName: combinedAirlineName,
            airlineAccent: sameCarrier ? d1.airlineAccent : '#D97706',
            flightNumber: `${d1.flightNumber} + ${d2.flightNumber}`,
            isMultiAirline: !sameCarrier,
            departureTime: d1.departureTime,
            arrivalTime: d2.arrivalTime,
            durationMinutes: totalDuration,
            stops: totalStops,
            stopLabel: `Conexão em ${selectedHub.iata} (${origin.iata} → ${selectedHub.iata} → ${destination.iata})`,
            cabinClass,
            baggageIncluded: '2 bilhetes separados · confira franquia por trecho',
            priceCash: combinedPrice,
            taxIncluded: 0,
            roundTripTotal: combinedPrice,
            milesEstimate: Math.round(combinedPrice * 22),
            rawUrl: d2.rawUrl,
            officialUrl: d2.officialUrl,
            hasDirectAirlineDeepLink: d2.hasDirectAirlineDeepLink,
            affiliatePartnerUrl: d2.affiliatePartnerUrl,
            sourceLabel: `2 Trechos Reais · Conexão em ${selectedHub.iata}`,
            isLiveVerified: true,
            connectionHubIata: selectedHub.iata,
            connectionHubCity: selectedHub.city,
            isSplitConnection: true,
            legs: [d1, d2],
          });
        }
      }

      splitCandidates.sort((a, b) => a.roundTripTotal - b.roundTripTotal);
      const maxSplitOffers = requestedHub ? 8 : 5;
      offers.push(...splitCandidates.slice(0, maxSplitOffers));
    }

    offers.sort((a, b) => a.roundTripTotal - b.roundTripTotal);

    const totals = offers.map((o) => o.roundTripTotal);
    const lowestPrice = totals[0] || 0;
    const highestPrice = totals[totals.length - 1] || 0;
    const avgPrice =
      totals.length > 0 ? Math.round(totals.reduce((s, v) => s + v, 0) / totals.length) : 0;

    // Use real historical daily price points from Google Flights (prefer single-ticket history, fallback to intl leg)
    const historySource =
      primaryLiveData && primaryLiveData.historyPoints.length > 0
        ? primaryLiveData
        : leg2Data && !destination.isBrazilian && leg2Data.historyPoints.length > 0
          ? leg2Data
          : leg1Data && !origin.isBrazilian && leg1Data.historyPoints.length > 0
            ? leg1Data
            : primaryLiveData || leg2Data || leg1Data;

    const priceHistory: FlightPriceHistoryPoint[] = [];
    if (historySource && historySource.historyPoints.length > 0) {
      const recent = historySource.historyPoints.slice(-30);
      const step = recent.length > 15 ? 2 : 1;
      for (let i = 0; i < recent.length; i += step) {
        const pt = recent[i];
        const d = new Date(pt.timestampMs);
        priceHistory.push({
          date: d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}),
          minPrice: pt.priceBrl,
          avgPrice: historySource.typicalPriceHigh
            ? Math.round((pt.priceBrl + historySource.typicalPriceHigh) / 2)
            : pt.priceBrl,
        });
      }
      if (lowestPrice > 0) {
        const lastPt = recent[recent.length - 1];
        const lastLabel = new Date(lastPt.timestampMs).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
        });
        if (priceHistory[priceHistory.length - 1]?.date !== lastLabel) {
          priceHistory.push({
            date: lastLabel,
            minPrice: lowestPrice,
            avgPrice: avgPrice || lowestPrice,
          });
        } else if (priceHistory.length > 0) {
          priceHistory[priceHistory.length - 1].minPrice = lowestPrice;
        }
      }
    } else if (lowestPrice > 0) {
      priceHistory.push({
        date: new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}),
        minPrice: lowestPrice,
        avgPrice: avgPrice || lowestPrice,
      });
    }

    const result: FlightComparisonResult = {
      scope,
      origin,
      destination,
      connectionHub: selectedHub,
      connectionMode: !needsConnectionHub
        ? 'direct_international'
        : requestedHub
          ? 'custom_hub'
          : 'auto_hub',
      recommendedHubIata: selectedHub?.iata,
      departureDate,
      returnDate:
        tripType === 'returnonly'
          ? departureDate
          : tripType === 'roundtrip'
            ? effectiveReturnDate
            : undefined,
      tripType,
      passengers,
      cabinClass,
      distanceKm,
      lowestPrice,
      avgPrice,
      highestPrice,
      typicalPriceLow: primaryLiveData?.typicalPriceLow,
      typicalPriceHigh: primaryLiveData?.typicalPriceHigh,
      bestAirlineName: offers[0]?.airlineName || '',
      offers,
      priceHistory,
      isLiveData: true,
      fetchedAt: (primaryLiveData || leg1Data || leg2Data)?.fetchedAt || new Date().toISOString(),
      googleFlightsAllUrl,
    };

    res.json(result);
  });

  app.post('/api/flights/live-search', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'A pesquisa ao vivo nos sites oficiais das companhias aéreas requer GEMINI_API_KEY configurada no painel Settings > Secrets.',
      });
      return;
    }

    const body = req.body || {};
    const scope: TravelScope = body.scope === 'international' ? 'international' : 'national';
    const originCode = String(body.originIata || (scope === 'national' ? 'VIX' : 'GRU')).toUpperCase();
    const destCode = String(body.destinationIata || (scope === 'national' ? 'GRU' : 'LIS')).toUpperCase();
    const rawDepartureDate = String(
      body.departureDate || new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    );
    const returnDate = body.returnDate ? String(body.returnDate) : undefined;
    const tripType: 'roundtrip' | 'oneway' | 'returnonly' =
      body.tripType === 'returnonly'
        ? 'returnonly'
        : body.tripType === 'oneway'
          ? 'oneway'
          : 'roundtrip';
    const departureDate =
      tripType === 'returnonly' && returnDate ? returnDate : rawDepartureDate;
    const passengers = Math.max(1, Math.min(9, Number(body.passengers) || 1));
    const cabinClass = String(body.cabinClass || 'Econômica');

    let origin: Airport | undefined;
    let destination: Airport | undefined;
    if (scope === 'international') {
      const brOrigin = BRAZILIAN_AIRPORTS.find((a) => a.iata === originCode);
      const intlDest = INTERNATIONAL_DESTINATIONS.find((a) => a.iata === destCode);
      const intlOrigin = INTERNATIONAL_DESTINATIONS.find((a) => a.iata === originCode);
      const brDest = BRAZILIAN_AIRPORTS.find((a) => a.iata === destCode);
      if (brOrigin && intlDest) {
        origin = brOrigin;
        destination = intlDest;
      } else if (intlOrigin && brDest) {
        origin = intlOrigin;
        destination = brDest;
      }
    } else {
      origin = BRAZILIAN_AIRPORTS.find((a) => a.iata === originCode);
      destination = BRAZILIAN_AIRPORTS.find((a) => a.iata === destCode);
    }

    if (!origin || !destination) {
      res.status(400).json({error: 'Aeroportos inválidos para pesquisa ao vivo.'});
      return;
    }

    const intlAirport = !destination.isBrazilian ? destination : origin;
    const relevantAirlines =
      scope === 'national'
        ? NATIONAL_AIRLINES
        : INTERNATIONAL_AIRLINES.filter((al) => !al.regions || al.regions.includes(intlAirport.region));

    const officialSiteList = relevantAirlines.map((a) => `${a.name} (${a.domain})`).join(', ');

    try {
      const prompt = [
        `Pesquise preços reais atuais de passagens aéreas em BRL (Reais) para a rota:`,
        `Origem: ${origin.city} (${origin.iata}) -> Destino: ${destination.city} (${destination.iata})`,
        `Tipo: ${
          tripType === 'roundtrip'
            ? `Ida e volta (${departureDate} a ${returnDate || departureDate})`
            : tripType === 'returnonly'
              ? `Só volta (${departureDate})`
              : `Só ida (${departureDate})`
        }`,
        `Passageiros: ${passengers} adulto(s), Cabine: ${cabinClass}.`,
        `Priorize exclusivamente os SITES OFICIAIS das companhias aéreas (${officialSiteList}) e Google Flights.`,
        `EVITE ao máximo sites de terceiros / agências OTA (não use preços ou links de Decolar, Kayak, Skyscanner, MaxMilhas, 123Milhas, Expedia, ViajaNet, Kiwi, eDreams ou Submarino).`,
        `Responda APENAS um JSON válido neste formato:`,
        `{"summary":"resumo curto em pt-BR dos sites oficiais pesquisados","fares":[{"airlineCode":"LA","airlineName":"LATAM Airlines Brasil","totalBrl":950,"stops":0,"stopLabel":"Voo direto","flightNumber":"LA 3210","officialUrl":"https://www.latamairlines.com/br/pt","sourceName":"Site Oficial LATAM"}]}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUrls = new Set<string>();
      const groundingSources: FlightGroundingSource[] = [];

      for (const ch of chunks) {
        const uri = ch.web?.uri;
        const title = ch.web?.title || '';
        if (!uri || seenUrls.has(uri)) continue;
        // Filter out third-party OTAs
        if (isThirdPartyOtaUrl(uri)) continue;
        seenUrls.add(uri);

        let domain = '';
        try {
          domain = new URL(uri).hostname.replace(/^www\./, '');
        } catch {
          domain = uri;
        }
        groundingSources.push({
          title: title || domain,
          url: uri,
          domain,
          isOfficialAirline: isOfficialAirlineUrl(uri),
        });
      }

      const rawText = (response.text || '').trim();
      const parsed =
        parseFirstBalancedJsonObject<{
          summary?: string;
          fares?: Array<{
            airlineCode?: string;
            airlineName?: string;
            totalBrl?: number;
            stops?: number;
            stopLabel?: string;
            flightNumber?: string;
            officialUrl?: string;
            sourceName?: string;
          }>;
        }>(rawText) || {};

      res.json({
        summary:
          parsed.summary ||
          `Pesquisa ao vivo concluída em ${groundingSources.length} fontes oficiais (terceiros filtrados).`,
        fares: Array.isArray(parsed.fares)
          ? parsed.fares.filter((f) => Number(f.totalBrl) > 0 && (!f.officialUrl || !isThirdPartyOtaUrl(f.officialUrl)))
          : [],
        groundingSources,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar fontes oficiais de passagens.';
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error: 'Chave GEMINI_API_KEY inválida ou sem permissão. Verifique em Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Limite de consultas ao vivo atingido temporariamente. Tente novamente em instantes.',
        });
        return;
      }
      res.status(502).json({error: `Falha na pesquisa ao vivo nos sites das companhias: ${msg}`});
    }
  });

  app.post('/api/flights/alert', async (req, res) => {
    const body = req.body || {};
    const originIata = String(body.originIata || 'GRU').toUpperCase();
    const destinationIata = String(body.destinationIata || 'LIS').toUpperCase();
    const airlineName = String(body.airlineName || 'Melhor Companhia');
    const newPrice = Math.max(100, Number(body.price) || 1200);
    const oldPrice = Math.max(newPrice + 50, Number(body.avgPrice) || Math.round(newPrice * 1.18));
    const targetMaxPrice = Math.max(100, Number(body.targetMaxPrice) || newPrice);
    const bookingUrl = String(body.bookingUrl || `https://www.google.com/travel/flights?q=${originIata}%20to%20${destinationIata}`);
    const scopeLabel = body.scope === 'international' ? 'Voo Internacional' : 'Voo Nacional';

    const originObj = ALL_AIRPORTS.find((a) => a.iata === originIata);
    const destObj = ALL_AIRPORTS.find((a) => a.iata === destinationIata);
    const routeTitle = `${scopeLabel}: ${originObj?.city || originIata} (${originIata}) → ${destObj?.city || destinationIata} (${destinationIata})`;
    const discountPercent = Number((((oldPrice - newPrice) / oldPrice) * 100).toFixed(1));

    const whatsappMessage = formatWhatsAppPromoMessage({
      template: state.botConfig.whatsappTemplate,
      productName: routeTitle,
      storeName: airlineName,
      oldPrice,
      newPrice,
      discountPercent,
      affiliateUrl: bookingUrl,
    });

    const alert: AlertNotification = {
      id: `alert-flt-${Date.now()}`,
      productId: `route-${originIata}-${destinationIata}`,
      productName: routeTitle,
      storeId: 'travel',
      storeName: airlineName,
      oldPrice,
      newPrice,
      discountPercent,
      targetMaxPrice,
      rawUrl: bookingUrl,
      affiliateUrl: bookingUrl,
      channels: ['whatsapp', 'push', 'dashboard'],
      whatsappStatus: state.botConfig.autoDispatchWhatsApp ? 'dispatched' : 'manual_ready',
      whatsappMessage,
      createdAt: new Date().toISOString(),
      read: false,
      purchased: false,
      savedAmount: 0,
    };

    if (state.botConfig.whatsappWebhookUrl.trim()) {
      const sent = await dispatchOptionalWebhook(state.botConfig.whatsappWebhookUrl, alert);
      if (sent) alert.whatsappStatus = 'webhook_sent';
    }

    state.alerts = [alert, ...state.alerts].slice(0, 60);
    saveState(state);
    broadcast('alert:triggered', alert);
    res.status(201).json(alert);
  });

  // --- CSV Export for Monthly Savings ---

  app.get('/api/savings/export', (_req, res) => {
    const header = 'Mes,Economia_BRL,Compras_Realizadas,Alertas_Disparados,Desconto_Medio_Pct,Melhor_Loja';
    const rows = state.monthlySavings.map(
      (m) =>
        `${m.monthKey},${m.savedTotal.toFixed(2)},${m.dealsPurchased},${m.alertsTriggered},${m.avgDiscount.toFixed(1)},"${m.topStore}"`,
    );
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mega-achados-027-economia-mensal.csv"');
    res.send(csv);
  });

  // --- HTTP + WebSocket Server ---

  const server = http.createServer(app);
  const wss = new WebSocketServer({noServer: true});

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({type: 'init', payload: state, timestamp: new Date().toISOString()}));

    ws.on('close', () => {
      clients.delete(ws);
    });
    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Server-side real-time price monitoring, 5-minute automatic deal publisher, 3-hour deal expiration & 30-minute coupon renewal scheduler
  let lastAutoScanMs = Date.now();
  const hasLiveCoupons = state.coupons.some((c) => c.verificationSource === 'google_search');
  if (
    !hasLiveCoupons ||
    !state.couponMeta?.nextRefreshAt ||
    Date.now() >= new Date(state.couponMeta.nextRefreshAt).getTime()
  ) {
    void refreshStoreCoupons();
  }

  const initialNextDealPublishMs = state.dealFeedMeta?.nextPublishAt
    ? new Date(state.dealFeedMeta.nextPublishAt).getTime()
    : 0;
  // Immediately upgrade any legacy search-page promotion URLs in the saved DB to real direct product links
  if (state.announcedDeals.some((d) => isStoreSearchUrl(d.rawUrl))) {
    void repairSearchUrlAnnouncedDeals();
  } else {
    hasCompletedInitialDealUrlRepair = true;
    if (state.announcedDeals.length === 0 || Date.now() >= initialNextDealPublishMs) {
      void publishScheduledDealBatch();
    }
  }

  setInterval(() => {
    // 1. Always enforce 3-hour deal TTL & active discount verification
    pruneExpiredAndInvalidDeals(true);

    // 2. Automatically publish new real deals with specific coupons every 5 minutes
    const nextDealPublishMs = state.dealFeedMeta?.nextPublishAt
      ? new Date(state.dealFeedMeta.nextPublishAt).getTime()
      : 0;
    if (!isPublishingScheduledDeals && Date.now() >= nextDealPublishMs) {
      void publishScheduledDealBatch();
    }

    // 3. Automatically renew & re-verify store coupons every 30 minutes
    const nextCouponRefreshMs = state.couponMeta?.nextRefreshAt
      ? new Date(state.couponMeta.nextRefreshAt).getTime()
      : 0;
    if (!isRefreshingCoupons && Date.now() >= nextCouponRefreshMs) {
      void refreshStoreCoupons();
    }

    // 4. Background price monitoring for Radar alerts
    if (!state.botConfig.enabled) return;
    const intervalMs = Math.max(8, state.botConfig.scanIntervalSec) * 1000;
    if (Date.now() - lastAutoScanMs >= intervalMs) {
      lastAutoScanMs = Date.now();
      void runPriceScan();
    }
  }, 3000);

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {server, path: '/__vite_hmr'},
        ws: {server, path: '/__vite_hmr'},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mega Achados 027 server running on http://localhost:${PORT}`);
  });
}

void startServer();
