export type AffiliateMode = 'query' | 'path_prefix' | 'template';

export interface StoreConfig {
  id: string;
  name: string;
  domain: string;
  active: boolean;
  accentHex: string;
  affiliateMode: AffiliateMode;
  affiliateParam: string;
  affiliateTag: string;
  affiliateTemplate: string;
  defaultShipping: string;
  installmentsInfo: string;
  isCustom?: boolean;
}

export interface PricePoint {
  id: string;
  timestamp: string;
  storeId: string;
  storeName: string;
  price: number;
  previousPrice: number;
  deltaValue: number;
  deltaPercent: number;
  rawUrl: string;
}

export interface StoreOffer {
  storeId: string;
  storeName: string;
  price: number;
  pixPrice: number;
  installments: string;
  shipping: string;
  shippingCost: number;
  inStock: boolean;
  rawUrl: string;
  updatedAt: string;
}

export interface MonitoredProduct {
  id: string;
  name: string;
  category: string;
  brand: string;
  sku: string;
  imageUrl: string;
  targetMinPrice: number;
  targetMaxPrice: number;
  minDiscountPercent: number;
  notifyWhatsApp: boolean;
  notifyPush: boolean;
  active: boolean;
  trackedStoreIds: string[];
  offers: StoreOffer[];
  history: PricePoint[];
  lastCheckedAt: string;
  bestPrice: number;
  bestStoreId: string;
  avgPrice: number;
  allTimeLow: number;
  allTimeHigh: number;
}

export type AlertChannel = 'whatsapp' | 'push' | 'dashboard';

export interface AlertNotification {
  id: string;
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  oldPrice: number;
  newPrice: number;
  discountPercent: number;
  targetMaxPrice: number;
  rawUrl: string;
  affiliateUrl: string;
  channels: AlertChannel[];
  whatsappStatus: 'queued' | 'dispatched' | 'webhook_sent' | 'manual_ready';
  whatsappMessage: string;
  createdAt: string;
  read: boolean;
  purchased: boolean;
  savedAmount: number;
}

export interface MonthlySavingsEntry {
  monthKey: string;
  label: string;
  savedTotal: number;
  dealsPurchased: number;
  alertsTriggered: number;
  avgDiscount: number;
  topStore: string;
}

export interface BotConfig {
  enabled: boolean;
  scanIntervalSec: number;
  whatsappPhone: string;
  whatsappGroupName: string;
  whatsappGroupInviteUrl?: string;
  whatsappGroupJid?: string;
  autoForwardAllDealsToGroup?: boolean;
  whatsappWebhookUrl: string;
  whatsappTemplate: string;
  pushEnabled: boolean;
  pushMinDiscount: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  autoDispatchWhatsApp: boolean;
  telegramImportedCount: number;
  lastScanAt: string;
}

export interface GroupForwardEntry {
  id: string;
  dealId: string;
  productName: string;
  storeName: string;
  price: number;
  referencePrice: number;
  discountPercent: number;
  couponCode?: string;
  affiliateUrl: string;
  groupName: string;
  message: string;
  status: 'webhook_sent' | 'ready_for_group' | 'sent_manually';
  createdAt: string;
  lastAttemptDetail?: string;
}

export interface AnnouncedDeal {
  id: string;
  productId: string;
  productName: string;
  category: string;
  brand: string;
  imageUrl: string;
  storeId: string;
  storeName: string;
  announcedPrice: number;
  referencePrice: number;
  announcedDiscountPercent: number;
  installments: string;
  shipping: string;
  rawUrl: string;
  affiliateUrl: string;
  verifiedByManualSearch: true;
  isLiveDiscovered?: boolean;
  couponCode?: string;
  couponLabel?: string;
  couponRule?: string;
  couponIsPageActivation?: boolean;
  announcedAt: string;
  expiresAt: string;
  lastVerifiedAt: string;
}

export interface StoreCoupon {
  id: string;
  storeId: string;
  storeName: string;
  storeDomain: string;
  storeAccentHex: string;
  code: string;
  title: string;
  description: string;
  discountLabel: string;
  minPurchaseLabel: string;
  category: string;
  affiliateUrl: string;
  verifiedAt: string;
  nextRefreshAt: string;
  verificationSource: 'google_search' | 'store_verified';
  sourceUrl?: string;
  active: boolean;
}

export interface CouponSyncMeta {
  lastRefreshedAt: string;
  nextRefreshAt: string;
  refreshIntervalMinutes: number;
  isRefreshing: boolean;
  verifiedStoresCount: number;
}

export interface DealFeedMeta {
  lastPublishedAt: string;
  nextPublishAt: string;
  publishIntervalMinutes: number;
  isPublishing: boolean;
}

export interface StoreProductCoupon {
  code: string;
  title: string;
  discountLabel: string;
  minPurchaseLabel?: string;
  rule?: string;
  isProductSpecific: boolean;
  isPageActivation?: boolean;
  verifiedAt?: string;
}

export interface CrossStoreProductOffer {
  storeId: string;
  storeName: string;
  storeDomain: string;
  storeAccentHex: string;
  foundLivePrice: boolean;
  productTitle: string;
  imageUrl?: string;
  price: number | null;
  referencePrice?: number | null;
  discountPercent?: number | null;
  installments?: string;
  shipping?: string;
  rawUrl: string;
  affiliateUrl: string;
  sourceLabel: string;
  coupons: StoreProductCoupon[];
}

export interface LiveProductStoreSearchResult {
  query: string;
  searchedAt: string;
  bestStoreName?: string;
  lowestPrice?: number | null;
  storesWithPriceCount: number;
  storesWithCouponCount: number;
  totalConfiguredStores: number;
  productImageUrl?: string;
  results: CrossStoreProductOffer[];
}

export interface AppStateSnapshot {
  products: MonitoredProduct[];
  stores: StoreConfig[];
  alerts: AlertNotification[];
  monthlySavings: MonthlySavingsEntry[];
  botConfig: BotConfig;
  announcedDeals: AnnouncedDeal[];
  dealFeedMeta?: DealFeedMeta;
  publishedProductHistory?: string[];
  groupForwardLog?: GroupForwardEntry[];
  coupons: StoreCoupon[];
  couponMeta: CouponSyncMeta;
}

export interface ParsedTelegramRule {
  name: string;
  category: string;
  targetMinPrice: number;
  targetMaxPrice: number;
  minDiscountPercent: number;
  storeIds: string[];
  sourceFormat: string;
}

export type TravelScope = 'national' | 'international';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  stateOrCountry: string;
  region: string;
  isBrazilian: boolean;
  hasInternationalFlights: boolean;
  lat: number;
  lon: number;
}

export interface FlightGroundingSource {
  title: string;
  url: string;
  domain: string;
  isOfficialAirline: boolean;
}

export interface FlightLegDetail {
  originIata: string;
  originCity: string;
  destinationIata: string;
  destinationCity: string;
  airlineCode: string;
  airlineName: string;
  airlineAccent: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  stopLabel: string;
  priceBrl: number;
  rawUrl: string;
  officialUrl: string;
  hasDirectAirlineDeepLink?: boolean;
  affiliatePartnerUrl: string;
}

export interface FlightFareOffer {
  id: string;
  airlineCode: string;
  airlineName: string;
  airlineAccent: string;
  flightNumber: string;
  aircraft?: string;
  isMultiAirline?: boolean;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  stopLabel: string;
  cabinClass: 'Econômica' | 'Econômica Premium' | 'Executiva';
  baggageIncluded: string;
  priceCash: number;
  taxIncluded: number;
  roundTripTotal: number;
  milesEstimate: number;
  rawUrl: string;
  officialUrl: string;
  hasDirectAirlineDeepLink?: boolean;
  affiliatePartnerUrl: string;
  sourceLabel: string;
  isLiveVerified?: boolean;
  connectionHubIata?: string;
  connectionHubCity?: string;
  isSplitConnection?: boolean;
  legs?: [FlightLegDetail, FlightLegDetail];
}

export interface FlightPriceHistoryPoint {
  date: string;
  minPrice: number;
  avgPrice: number;
}

export type TripType = 'roundtrip' | 'oneway' | 'returnonly';

export interface FlightComparisonResult {
  scope: TravelScope;
  origin: Airport;
  destination: Airport;
  connectionHub?: Airport;
  connectionMode?: 'direct_international' | 'auto_hub' | 'custom_hub';
  recommendedHubIata?: string;
  departureDate: string;
  returnDate?: string;
  tripType: TripType;
  passengers: number;
  cabinClass: 'Econômica' | 'Econômica Premium' | 'Executiva';
  distanceKm: number;
  lowestPrice: number;
  avgPrice: number;
  highestPrice: number;
  typicalPriceLow?: number;
  typicalPriceHigh?: number;
  bestAirlineName: string;
  offers: FlightFareOffer[];
  priceHistory: FlightPriceHistoryPoint[];
  isLiveData?: boolean;
  fetchedAt?: string;
  googleFlightsAllUrl?: string;
  groundingSources?: FlightGroundingSource[];
  liveSearchSummary?: string;
}

export interface WhatsappForwarderSettings {
  senderPhone: string;
  senderDisplayName: string;
  enabled: boolean;
  welcomeMessage: string;
  groupName?: string;
  groupInviteUrl?: string;
  autoForwardAllDealsToGroup?: boolean;
  updatedByUid: string;
  updatedAt?: string;
}

export interface WhatsappSubscriber {
  uid: string;
  displayName: string;
  phoneNumber: string;
  optIn: boolean;
  receiveProducts: boolean;
  receiveFlights: boolean;
  selectedProducts: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsappForwarderDispatchResult {
  sentCount: number;
  failedCount: number;
  totalCount: number;
  mode: 'webhook' | 'manual_only';
  results: Array<{
    uid: string;
    phoneNumber: string;
    displayName: string;
    ok: boolean;
    detail?: string;
  }>;
}

export type ActiveTab =
  | 'deals'
  | 'coupons'
  | 'radar'
  | 'compare'
  | 'travel'
  | 'alerts'
  | 'savings'
  | 'stores'
  | 'automation'
  | 'forwarder';


