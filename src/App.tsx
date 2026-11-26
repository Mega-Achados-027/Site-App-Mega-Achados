import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BarChart3,
  Bell,
  Bookmark,
  Bot,
  ExternalLink,
  Eye,
  Globe,
  LogIn,
  MessageCircle,
  Moon,
  Plane,
  Plus,
  Radar,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Store,
  Sun,
  Tag,
  Ticket,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  ActiveTab,
  AlertNotification,
  BotConfig,
  LiveProductStoreSearchResult,
  MonitoredProduct,
  StoreConfig,
  TravelScope,
} from './types.ts';
import {useAuth} from './contexts/AuthContext.tsx';
import {useBotSocket} from './hooks/useBotSocket.ts';
import {usePushNotifications} from './hooks/usePushNotifications.ts';
import {buildWhatsAppDeepLink} from './utils/affiliate.ts';
import {formatBRL, formatRelativeTime} from './utils/format.ts';
import {PWAInstallButton} from './components/PWAInstallButton.tsx';
import {OfflineIndicator} from './components/OfflineIndicator.tsx';
import {ProductImage} from './components/ProductImage.tsx';
import {PriceHistoryPanel} from './components/PriceHistoryPanel.tsx';
import {QuickCompareView} from './components/QuickCompareView.tsx';
import {StoresAffiliatesView} from './components/StoresAffiliatesView.tsx';
import {AlertsInboxView} from './components/AlertsInboxView.tsx';
import {SavingsReportView} from './components/SavingsReportView.tsx';
import {BotAutomationView} from './components/BotAutomationView.tsx';
import {AddProductModal} from './components/AddProductModal.tsx';
import {ShareDealModal} from './components/ShareDealModal.tsx';
import {TravelFlightsView} from './components/TravelFlightsView.tsx';
import {MemberDealsView} from './components/MemberDealsView.tsx';
import {CouponsView} from './components/CouponsView.tsx';
import {AuthModal} from './components/AuthModal.tsx';
import {AdminWhatsAppForwarderView} from './components/AdminWhatsAppForwarderView.tsx';

const BRAND_LOGO = '/assets/aistudio/ChatGPT_Image_17_de_set._de_2026__08_48_50_36447620.png';

const TAB_META: Record<ActiveTab, {title: string; shortLabel: string}> = {
  deals: {title: 'Promoções de Produtos', shortLabel: 'Produtos'},
  coupons: {title: 'Cupons das Lojas Configuradas', shortLabel: 'Cupons'},
  radar: {title: 'Radar de Preços', shortLabel: 'Radar'},
  compare: {title: 'Comparar Varejistas', shortLabel: 'Comparar'},
  travel: {title: 'Viagens & Comparador de Voos', shortLabel: 'Viagens'},
  alerts: {title: 'Central de Alertas', shortLabel: 'Alertas'},
  savings: {title: 'Relatórios de Economia', shortLabel: 'Economia'},
  stores: {title: 'Lojas, Afiliados & Tutorial', shortLabel: 'Afiliados'},
  automation: {title: 'WhatsApp, Push & Telegram', shortLabel: 'Bot'},
  forwarder: {title: 'Encaminhador WhatsApp (Admin)', shortLabel: 'Encaminhador'},
};

export default function App() {
  const {user, profile, isAdmin, savedDeals, whatsappSubscription, adminSubscribers} = useAuth();
  const [viewAsMember, setViewAsMember] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup' | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('deals');
  const [travelScope, setTravelScope] = useState<TravelScope>('national');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    product: MonitoredProduct;
    storeId?: string;
  } | null>(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [liveToast, setLiveToast] = useState<AlertNotification | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('megaachados027_theme');
    return saved ? saved === 'dark' : true;
  });

  const isMemberExperience = !isAdmin || viewAsMember;
  const isMemberRef = React.useRef<boolean>(isMemberExperience);
  isMemberRef.current = isMemberExperience;

  useEffect(() => {
    if (isAdmin && !viewAsMember) {
      setActiveTab((prev) => (prev === 'deals' ? 'radar' : prev));
    } else {
      setActiveTab((prev) => (prev === 'travel' || prev === 'coupons' ? prev : 'deals'));
    }
  }, [isAdmin, viewAsMember]);

  const {permission: pushPermission, requestPermission, sendBrowserPush} = usePushNotifications();

  const botConfigRef = React.useRef<BotConfig | undefined>(undefined);

  const handleIncomingAlert = useCallback(
    (alert: AlertNotification) => {
      if (isMemberRef.current) return;
      setLiveToast(alert);
      void sendBrowserPush(alert, botConfigRef.current);
    },
    [sendBrowserPush],
  );

  const {state, connectionState, isLoading, error, refresh} = useBotSocket(handleIncomingAlert);

  useEffect(() => {
    botConfigRef.current = state?.botConfig;
  }, [state?.botConfig]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('megaachados027_theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('megaachados027_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = window.setTimeout(() => setLiveToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [liveToast]);

  const products = state?.products || [];
  const stores = state?.stores || [];
  const alerts = state?.alerts || [];
  const monthlySavings = state?.monthlySavings || [];
  const botConfig = state?.botConfig;
  const announcedDeals = state?.announcedDeals || [];
  const dealFeedMeta = state?.dealFeedMeta;
  const groupForwardLog = state?.groupForwardLog || [];
  const coupons = state?.coupons || [];
  const couponMeta = state?.couponMeta;

  const availableProducts = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    const addName = (raw: string) => {
      const clean = raw.trim().slice(0, 80);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(clean);
    };
    announcedDeals.forEach((d) => addName(d.productName));
    products.forEach((p) => addName(p.name));
    return names.slice(0, 20);
  }, [announcedDeals, products]);

  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter]);

  const selectedProduct =
    products.find((p) => p.id === selectedProductId) || filteredProducts[0] || products[0];

  const unreadAlertsCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);
  const activeStoresCount = useMemo(() => stores.filter((s) => s.active).length, [stores]);
  const currentMonthSavings =
    monthlySavings.length > 0 ? monthlySavings[monthlySavings.length - 1].savedTotal : 0;

  // --- API Handlers ---

  const handleGlobalScan = async () => {
    setScanningAll(true);
    try {
      await fetch('/api/scan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({manual: true}),
      });
    } finally {
      setScanningAll(false);
    }
  };

  const handleForceProductScan = async (productId: string) => {
    await fetch('/api/scan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({productId, manual: true}),
    });
  };

  const handleManualDealSearch = async (opts?: {query?: string; category?: string}) => {
    const resp = await fetch('/api/deals/manual-search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: opts?.query || '',
        category: opts?.category || 'all',
      }),
    });
    if (!resp.ok) {
      throw new Error('Falha ao pesquisar ofertas manualmente.');
    }
    const data = (await resp.json()) as {announcedNow: number; checkedCount: number};
    return {announcedNow: data.announcedNow, checkedCount: data.checkedCount};
  };

  const handleLiveProductSearch = async (
    query: string,
  ): Promise<LiveProductStoreSearchResult> => {
    const resp = await fetch('/api/products/live-search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query}),
    });
    if (!resp.ok) {
      const errData = (await resp.json().catch(() => ({}))) as {error?: string};
      throw new Error(
        errData.error || 'Não foi possível buscar os preços desse produto nas lojas agora.',
      );
    }
    return (await resp.json()) as LiveProductStoreSearchResult;
  };

  const handleRefreshCoupons = async () => {
    await fetch('/api/coupons/refresh', {method: 'POST'});
  };

  const handleCreateProduct = async (payload: {
    name: string;
    category: string;
    brand: string;
    basePrice: number;
    targetMinPrice: number;
    targetMaxPrice: number;
    minDiscountPercent: number;
    trackedStoreIds: string[];
    notifyWhatsApp: boolean;
    notifyPush: boolean;
  }) => {
    const resp = await fetch('/api/products', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const created = (await resp.json()) as MonitoredProduct;
      setSelectedProductId(created.id);
      setActiveTab('radar');
    }
  };

  const handleUpdateProductRule = async (
    productId: string,
    patch: Partial<
      Pick<
        MonitoredProduct,
        'targetMinPrice' | 'targetMaxPrice' | 'minDiscountPercent' | 'notifyWhatsApp' | 'notifyPush' | 'active'
      >
    >,
  ) => {
    await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    await fetch(`/api/products/${productId}`, {method: 'DELETE'});
  };

  const handleUpdateStore = async (storeId: string, patch: Partial<StoreConfig>) => {
    await fetch(`/api/stores/${storeId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
  };

  const handleCreateStore = async (payload: Omit<StoreConfig, 'id' | 'isCustom'>) => {
    await fetch('/api/stores', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
  };

  const handleDeleteStore = async (storeId: string) => {
    await fetch(`/api/stores/${storeId}`, {method: 'DELETE'});
  };

  const handleMarkAlertRead = async (alertId: string) => {
    await fetch(`/api/alerts/${alertId}/read`, {method: 'POST'});
  };

  const handleMarkAllAlertsRead = async () => {
    await fetch('/api/alerts/read-all', {method: 'POST'});
  };

  const handleMarkAlertPurchased = async (alertId: string) => {
    await fetch(`/api/alerts/${alertId}/purchase`, {method: 'POST'});
  };

  const handleTestWhatsApp = async () => {
    await fetch('/api/alerts/test-whatsapp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({productId: selectedProduct?.id}),
    });
  };

  const handleTestPush = async () => {
    if (pushPermission !== 'granted') {
      await requestPermission();
    }
    await handleTestWhatsApp();
  };

  const handleUpdateBotConfig = async (patch: Partial<BotConfig>) => {
    await fetch('/api/bot/config', {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(patch),
    });
  };

  const handleImportTelegram = async (payload: string) => {
    const resp = await fetch('/api/telegram/import', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({payload}),
    });
    if (!resp.ok) {
      const errData = (await resp.json().catch(() => ({}))) as {error?: string};
      throw new Error(errData.error || 'Falha ao migrar regras do Telegram.');
    }
    return (await resp.json()) as {importedCount: number};
  };

  const activeSubscribersCount = useMemo(
    () => adminSubscribers.filter((s) => s.optIn).length,
    [adminSubscribers],
  );

  const desktopNavItems: Array<{id: ActiveTab; label: string; icon: React.ReactNode; count?: number}> = [
    {id: 'radar', label: 'Radar de Preços', icon: <Radar className="w-4 h-4" />},
    {id: 'compare', label: 'Comparar Lojas', icon: <Scale className="w-4 h-4" />},
    {id: 'coupons', label: 'Cupons das Lojas', icon: <Ticket className="w-4 h-4" />, count: coupons.length},
    {id: 'travel', label: 'Viagens & Voos', icon: <Plane className="w-4 h-4" />},
    {
      id: 'alerts',
      label: 'Alertas',
      icon: <Bell className="w-4 h-4" />,
      count: unreadAlertsCount,
    },
    {id: 'savings', label: 'Economia', icon: <BarChart3 className="w-4 h-4" />},
    {id: 'stores', label: 'Lojas & Afiliados', icon: <Store className="w-4 h-4" />},
    {id: 'automation', label: 'WhatsApp & Bot', icon: <Bot className="w-4 h-4" />},
    {
      id: 'forwarder',
      label: 'Encaminhador WhatsApp',
      icon: <Send className="w-4 h-4" />,
      count: activeSubscribersCount,
    },
  ];

  const mobileNavItems: Array<{id: ActiveTab; label: string; icon: React.ReactNode; count?: number}> = [
    {id: 'radar', label: 'Radar', icon: <Radar className="w-5 h-5" />},
    {id: 'coupons', label: 'Cupons', icon: <Ticket className="w-5 h-5" />},
    {id: 'travel', label: 'Viagens', icon: <Plane className="w-5 h-5" />},
    {id: 'alerts', label: 'Alertas', icon: <Bell className="w-5 h-5" />, count: unreadAlertsCount},
    {
      id: 'forwarder',
      label: 'WhatsApp',
      icon: <Send className="w-5 h-5" />,
      count: activeSubscribersCount,
    },
    {id: 'automation', label: 'Bot', icon: <Bot className="w-5 h-5" />},
  ];

  const memberDisplayName = useMemo(() => {
    const raw =
      profile?.displayName ||
      user?.displayName ||
      user?.email?.split('@')[0] ||
      (user?.phoneNumber ? `Membro ${user.phoneNumber.slice(-4)}` : 'Conta');
    return raw.split(' ')[0];
  }, [profile?.displayName, user?.displayName, user?.email, user?.phoneNumber]);

  // --- RESTRICTED PUBLIC & MEMBER STOREFRONT (PRODUCT DEALS + STORE COUPONS + TRAVEL DEALS + LOGIN/SIGNUP) ---
  if (isMemberExperience) {
    const memberTab: 'deals' | 'coupons' | 'travel' =
      activeTab === 'travel' ? 'travel' : activeTab === 'coupons' ? 'coupons' : 'deals';

    return (
      <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-[#07070A] text-zinc-950 dark:text-zinc-100">
        {/* Clean Public/Member Top Header */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 border-b border-zinc-200 dark:border-zinc-800/90 bg-white/95 dark:bg-[#0D0E12]/95 backdrop-blur-md">
          <div className="max-w-[1320px] h-full mx-auto flex items-center justify-between gap-3">
            {/* Brand Identity */}
            <button
              type="button"
              onClick={() => setActiveTab('deals')}
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
            >
              <img
                src={BRAND_LOGO}
                alt="Mega Achados 027"
                className="w-9 h-9 rounded-lg object-cover border border-yellow-400/40 shrink-0"
              />
              <span className="font-display text-sm sm:text-base font-extrabold tracking-normal text-zinc-950 dark:text-white">
                Mega <span className="text-red-600 dark:text-yellow-400">Achados 027</span>
              </span>
            </button>

            {/* Primary Navigation (Desktop): Produtos | Cupons | Voos Nacionais | Voos Internacionais */}
            <nav
              aria-label="Seções de promoções"
              className="hidden md:inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#13141A] border border-zinc-200/80 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => setActiveTab('deals')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  memberTab === 'deals'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Produtos</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('coupons')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  memberTab === 'coupons'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Cupons</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTravelScope('national');
                  setActiveTab('travel');
                }}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  memberTab === 'travel' && travelScope === 'national'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Voos Nacionais</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTravelScope('international');
                  setActiveTab('travel');
                }}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  memberTab === 'travel' && travelScope === 'international'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Voos Internacionais</span>
              </button>
            </nav>

            {/* Right Controls: Admin Back Button (if admin previewing), Install App, Theme, Login / Signup / Account */}
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setViewAsMember(false)}
                  className="min-h-[38px] px-3 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Voltar ao Painel Admin</span>
                  <span className="sm:hidden">Admin</span>
                </button>
              )}

              <PWAInstallButton compact hideLabelOnSmall />

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                className="min-h-[38px] min-w-[38px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                aria-label="Alternar tema"
              >
                {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
              </button>

              {!user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('login')}
                    className="min-h-[38px] px-3 sm:px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <LogIn className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                    <span>Entrar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('signup')}
                    className="min-h-[38px] px-3 sm:px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Criar Conta</span>
                    <span className="sm:hidden">Cadastrar</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalMode('login')}
                  className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] hover:border-yellow-400/60 text-xs font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                  <span className="max-w-[96px] truncate">{memberDisplayName}</span>
                  <span
                    title={
                      whatsappSubscription?.optIn
                        ? 'WhatsApp vinculado para ofertas'
                        : 'Clique para vincular seu WhatsApp'
                    }
                    className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold ${
                      whatsappSubscription?.optIn
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </span>
                  {savedDeals.length > 0 && (
                    <span className="inline-flex items-center gap-1 font-mono-num text-[11px] text-amber-700 dark:text-yellow-400">
                      <Bookmark className="w-3 h-3" />
                      {savedDeals.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Public/Member Content Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 max-w-[1320px] w-full mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-14 w-64 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-80 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : error && !state ? (
            <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-8 text-center">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-4 min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {memberTab === 'deals' && (
                <MemberDealsView
                  announcedDeals={announcedDeals}
                  dealFeedMeta={dealFeedMeta}
                  products={products}
                  whatsappGroupName={botConfig?.whatsappGroupName}
                  whatsappGroupInviteUrl={botConfig?.whatsappGroupInviteUrl}
                  onManualSearch={handleManualDealSearch}
                  onLiveProductSearch={handleLiveProductSearch}
                  onRequireAuth={(mode = 'login') => setAuthModalMode(mode)}
                />
              )}
              {memberTab === 'coupons' && (
                <CouponsView
                  coupons={coupons}
                  stores={stores}
                  couponMeta={couponMeta}
                  onRefreshCoupons={handleRefreshCoupons}
                />
              )}
              {memberTab === 'travel' && botConfig && (
                <TravelFlightsView
                  botConfig={botConfig}
                  memberMode
                  controlledScope={travelScope}
                  onScopeChange={setTravelScope}
                  onRequireAuth={(mode = 'login') => setAuthModalMode(mode)}
                />
              )}
            </>
          )}
        </main>

        {/* Compact Mobile Bottom Navigation (Produtos | Cupons | Nacionais | Internacionais | Conta) */}
        <nav
          aria-label="Navegação móvel de promoções"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0D0E12]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-safe"
        >
          <div className="grid grid-cols-5 items-center h-14">
            <button
              type="button"
              onClick={() => setActiveTab('deals')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                memberTab === 'deals'
                  ? 'text-red-600 dark:text-yellow-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Tag className="w-5 h-5" />
              <span className="text-[10px] font-medium">Produtos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('coupons')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                memberTab === 'coupons'
                  ? 'text-red-600 dark:text-yellow-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Ticket className="w-5 h-5" />
              <span className="text-[10px] font-medium">Cupons</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTravelScope('national');
                setActiveTab('travel');
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                memberTab === 'travel' && travelScope === 'national'
                  ? 'text-red-600 dark:text-yellow-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Plane className="w-5 h-5" />
              <span className="text-[10px] font-medium">Nacionais</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTravelScope('international');
                setActiveTab('travel');
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                memberTab === 'travel' && travelScope === 'international'
                  ? 'text-red-600 dark:text-yellow-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Globe className="w-5 h-5" />
              <span className="text-[10px] font-medium">Exteriores</span>
            </button>

            <button
              type="button"
              onClick={() => setAuthModalMode('login')}
              className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              {user ? (
                <UserCheck className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              <span className="text-[10px] font-medium">{user ? 'Conta' : 'Entrar'}</span>
            </button>
          </div>
        </nav>

        {authModalMode && (
          <AuthModal
            initialMode={authModalMode}
            availableProducts={availableProducts}
            onClose={() => setAuthModalMode(null)}
          />
        )}

        <OfflineIndicator />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-[#07070A] text-zinc-950 dark:text-zinc-100">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#0D0E12] sticky top-0 h-screen">
        <div className="h-16 px-4 flex items-center border-b border-zinc-200 dark:border-zinc-800/90">
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left"
          >
            <img
              src={BRAND_LOGO}
              alt="Mega Achados 027"
              className="w-9 h-9 rounded-lg object-cover border border-yellow-400/40 shrink-0"
            />
            <span className="font-display text-base font-extrabold tracking-normal text-zinc-950 dark:text-white">
              Mega <span className="text-red-600 dark:text-yellow-400">Achados 027</span>
            </span>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Navegação principal">
          {desktopNavItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[42px] px-3.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`font-mono-num text-xs font-bold ${
                      active ? 'text-yellow-400 dark:text-red-700' : 'text-red-600 dark:text-yellow-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/90 space-y-2">
          <button
            type="button"
            onClick={() => setViewAsMember(true)}
            className="w-full min-h-[40px] px-3.5 rounded-xl border border-yellow-400/40 bg-amber-50/70 dark:bg-yellow-400/10 text-xs font-semibold text-amber-800 dark:text-yellow-300 hover:bg-amber-100/70 dark:hover:bg-yellow-400/20 flex items-center justify-between transition-colors"
          >
            <span>Modo Cliente (Vitrine)</span>
            <Eye className="w-4 h-4 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setAuthModalMode('login')}
            className="w-full min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between gap-2 transition-colors"
          >
            <span className="truncate">{memberDisplayName} · Admin</span>
            <UserCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
          </button>
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="w-full min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between transition-colors"
          >
            <span>{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
            {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Desktop 64px / Mobile compact 52px) */}
        <header className="sticky top-0 z-30 h-[52px] lg:h-16 px-4 lg:px-8 border-b border-zinc-200 dark:border-zinc-800/90 bg-white/90 dark:bg-[#0D0E12]/90 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={BRAND_LOGO}
              alt="Mega Achados 027"
              className="lg:hidden w-8 h-8 rounded-lg object-cover border border-yellow-400/40 shrink-0"
            />
            <span className="lg:hidden font-display text-sm font-extrabold tracking-normal text-zinc-950 dark:text-white whitespace-nowrap shrink-0">
              Mega <span className="text-red-600 dark:text-yellow-400">Achados 027</span>
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-zinc-950 dark:text-white whitespace-nowrap shrink-0">
              {TAB_META[activeTab].title}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact hideLabelOnSmall />
            </div>

            <button
              type="button"
              onClick={() => setViewAsMember(true)}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-yellow-400/40 bg-amber-50/70 dark:bg-yellow-400/10 flex items-center justify-center text-amber-700 dark:text-yellow-400"
              aria-label="Modo Cliente"
              title="Ver como Cliente"
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setAuthModalMode('login')}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
              aria-label="Minha Conta"
            >
              <UserCheck className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stores')}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
              aria-label="Lojas e Afiliados"
            >
              <Store className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('savings')}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
              aria-label="Relatórios de Economia"
            >
              <BarChart3 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
              aria-label="Alternar tema"
            >
              {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleGlobalScan}
              disabled={scanningAll}
              className="hidden sm:inline-flex min-h-[40px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningAll ? 'animate-spin' : ''}`} />
              <span>{scanningAll ? 'Verificando...' : 'Verificar Preços'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[38px] lg:min-h-[40px] px-3.5 lg:px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Produto</span>
              <span className="sm:hidden">Monitorar</span>
            </button>
          </div>
        </header>

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-[1360px] w-full mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-96 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900 animate-pulse" />
            </div>
          ) : error && !state ? (
            <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-8 text-center">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-4 min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {/* TAB 1: RADAR DE PREÇOS & HISTÓRICO DETALHADO */}
              {activeTab === 'radar' && botConfig && (
                <div className="space-y-6">
                  {/* Top Brand Hero Strip */}
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-normal">
                        Mega <span className="text-red-600 dark:text-yellow-400">Achados 027</span>
                      </h1>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              connectionState === 'connected' ? 'bg-yellow-400' : 'bg-red-500'
                            }`}
                          />
                          {connectionState === 'connected'
                            ? botConfig.enabled
                              ? 'Ofertas em tempo real ativas'
                              : 'Robô pausado'
                            : 'Reconectando ao servidor...'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Última varredura {formatRelativeTime(botConfig.lastScanAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{botConfig.whatsappGroupName || botConfig.whatsappPhone}</span>
                      </div>
                    </div>

                    <div className="sm:hidden">
                      <PWAInstallButton compact />
                    </div>
                  </div>

                  {/* 4-Column KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('savings')}
                      className="text-left rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 hover:border-yellow-400/70 transition-colors"
                    >
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Economia no Mês</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                        {formatBRL(currentMonthSavings)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Ver relatório mensal
                      </p>
                    </button>

                    <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Produtos no Radar</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
                        {products.length}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {products.filter((p) => p.bestPrice <= p.targetMaxPrice).length} dentro do preço alvo
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('stores')}
                      className="text-left rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 hover:border-yellow-400/70 transition-colors"
                    >
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Lojas & Afiliados</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
                        {activeStoresCount}
                      </p>
                      <p className="mt-0.5 text-[11px] text-red-600 dark:text-yellow-400 font-medium">
                        Tutorial + tags de afiliado
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('alerts')}
                      className="text-left rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 hover:border-yellow-400/70 transition-colors"
                    >
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Alertas Disparados</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold font-mono-num text-zinc-950 dark:text-white">
                        {alerts.length}
                      </p>
                      <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400 font-medium">
                        {unreadAlertsCount > 0 ? `${unreadAlertsCount} não lidos` : 'Tudo atualizado'}
                      </p>
                    </button>
                  </div>

                  {/* Main 2-Column Radar + Price History Workspace */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Monitored Products Feed */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar produto monitorado..."
                            className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                          />
                        </div>
                        <select
                          aria-label="Filtrar categoria"
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0 sm:max-w-[160px]"
                        >
                          <option value="all">Todas</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
                        {filteredProducts.length === 0 ? (
                          <div className="p-8 text-center">
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              Nenhum produto encontrado
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowAddModal(true)}
                              className="mt-3 min-h-[38px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold"
                            >
                              Monitorar primeiro produto
                            </button>
                          </div>
                        ) : (
                          filteredProducts.map((prod) => {
                            const isSelected = selectedProduct?.id === prod.id;
                            const inRange = prod.bestPrice <= prod.targetMaxPrice;
                            const bestStore = stores.find((s) => s.id === prod.bestStoreId);
                            return (
                              <div
                                key={prod.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedProductId(prod.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedProductId(prod.id);
                                  }
                                }}
                                className={`p-4 flex items-start gap-3.5 cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-amber-50/70 dark:bg-yellow-400/[0.08]'
                                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                                }`}
                              >
                                <ProductImage
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  className="w-16 h-16 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-zinc-950 dark:text-white line-clamp-2 leading-snug">
                                      {prod.name}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDeleteProduct(prod.id);
                                      }}
                                      aria-label={`Remover ${prod.name}`}
                                      className="min-h-[32px] min-w-[32px] -mr-1 -mt-1 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                                    <span className="text-base font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                                      {formatBRL(prod.bestPrice)}
                                    </span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                      em {bestStore?.name || 'Loja'}
                                    </span>
                                  </div>

                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <span
                                      className={
                                        inRange
                                          ? 'font-semibold text-red-600 dark:text-yellow-400'
                                          : ''
                                      }
                                    >
                                      {inRange
                                        ? 'No preço alvo'
                                        : `Alvo até ${formatBRL(prod.targetMaxPrice)}`}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>{prod.offers.length} lojas</span>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {[
                                        prod.notifyWhatsApp ? 'WhatsApp' : '',
                                        prod.notifyPush ? 'Push' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' + ') || 'Painel'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Right Column: Detailed Price History Graph + Table */}
                    <div className="lg:col-span-7">
                      {selectedProduct ? (
                        <PriceHistoryPanel
                          product={selectedProduct}
                          stores={stores}
                          onUpdateRule={handleUpdateProductRule}
                          onForceScan={handleForceProductScan}
                          onShareProduct={(product) => setShareTarget({product})}
                        />
                      ) : (
                        <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">
                          Selecione um produto para visualizar o histórico detalhado de preços.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: COMPARADOR RÁPIDO ENTRE VAREJISTAS */}
              {activeTab === 'compare' && botConfig && (
                <QuickCompareView
                  products={products}
                  stores={stores}
                  botConfig={botConfig}
                  initialProductId={selectedProduct?.id}
                  onShareProduct={(product, storeId) => setShareTarget({product, storeId})}
                />
              )}

              {/* TAB 3: CENTRAL DE ALERTAS */}
              {activeTab === 'alerts' && botConfig && (
                <AlertsInboxView
                  alerts={alerts}
                  botConfig={botConfig}
                  onMarkRead={handleMarkAlertRead}
                  onMarkAllRead={handleMarkAllAlertsRead}
                  onMarkPurchased={handleMarkAlertPurchased}
                  onTestWhatsApp={handleTestWhatsApp}
                />
              )}

              {/* TAB 4: RELATÓRIOS MENSAIS DE ECONOMIA */}
              {activeTab === 'savings' && (
                <SavingsReportView monthlySavings={monthlySavings} alerts={alerts} />
              )}

              {/* TAB 5: MÚLTIPLAS LOJAS, LINKS DE AFILIADOS & MINI TUTORIAL */}
              {activeTab === 'stores' && (
                <StoresAffiliatesView
                  stores={stores}
                  onUpdateStore={handleUpdateStore}
                  onCreateStore={handleCreateStore}
                  onDeleteStore={handleDeleteStore}
                />
              )}

              {/* TAB 6: WHATSAPP, PUSH & MIGRAÇÃO TELEGRAM */}
              {activeTab === 'automation' && botConfig && (
                <BotAutomationView
                  botConfig={botConfig}
                  pushPermission={pushPermission}
                  onRequestPushPermission={requestPermission}
                  onUpdateBotConfig={handleUpdateBotConfig}
                  onTestWhatsApp={handleTestWhatsApp}
                  onTestPush={handleTestPush}
                  onImportTelegram={handleImportTelegram}
                />
              )}
              {/* TAB 7: VIAGENS & COMPARADOR DE VOOS */}
              {activeTab === 'travel' && botConfig && (
                <TravelFlightsView
                  botConfig={botConfig}
                  controlledScope={travelScope}
                  onScopeChange={setTravelScope}
                />
              )}

              {/* TAB 8: CUPONS DAS LOJAS CONFIGURADAS (RENOVAÇÃO 30 MIN) */}
              {activeTab === 'coupons' && (
                <CouponsView
                  coupons={coupons}
                  stores={stores}
                  couponMeta={couponMeta}
                  onRefreshCoupons={handleRefreshCoupons}
                />
              )}

              {/* TAB 9: ENCAMINHADOR WHATSAPP (EXCLUSIVO ADMINISTRADOR) */}
              {activeTab === 'forwarder' && isAdmin && botConfig && (
                <AdminWhatsAppForwarderView
                  botConfig={botConfig}
                  announcedDeals={announcedDeals}
                  groupForwardLog={groupForwardLog}
                  onUpdateBotConfig={handleUpdateBotConfig}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar (56px height — adheres to <= 15% total sticky surface cap) */}
      <nav
        aria-label="Navegação móvel"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0D0E12]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-safe"
      >
        <div className="grid grid-cols-6 items-center h-14">
          {mobileNavItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-red-600 dark:text-yellow-400'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 text-[10px] font-bold font-mono-num text-red-600 dark:text-yellow-400">
                      {item.count > 9 ? '9+' : item.count}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium tracking-normal px-0.5 truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Real-Time In-App Push Toast Notification */}
      {liveToast && botConfig && (
        <div
          role="status"
          className="fixed top-16 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-[#13141A] text-white border border-yellow-400/40 p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-yellow-400">
                Mega Achados 027 · {liveToast.storeName}
              </p>
              <p className="mt-0.5 text-sm font-semibold line-clamp-1">{liveToast.productName}</p>
              <p className="mt-1 text-base font-bold font-mono-num text-yellow-400">
                {formatBRL(liveToast.newPrice)}{' '}
                <span className="text-xs font-semibold text-red-400">
                  (-{liveToast.discountPercent.toFixed(0)}%)
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLiveToast(null)}
              aria-label="Fechar notificação"
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={buildWhatsAppDeepLink(botConfig.whatsappPhone, liveToast.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[36px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Enviar WhatsApp</span>
            </a>
            <a
              href={liveToast.affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[36px] px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <span>Ver Oferta</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddProductModal
          stores={stores}
          onClose={() => setShowAddModal(false)}
          onCreate={handleCreateProduct}
        />
      )}

      {shareTarget && botConfig && (
        <ShareDealModal
          product={shareTarget.product}
          stores={stores}
          botConfig={botConfig}
          initialStoreId={shareTarget.storeId}
          onClose={() => setShareTarget(null)}
        />
      )}

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          availableProducts={availableProducts}
          onClose={() => setAuthModalMode(null)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
