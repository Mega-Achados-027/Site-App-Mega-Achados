import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeftRight,
  Bell,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Luggage,
  MapPin,
  MessageCircle,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  Airport,
  BotConfig,
  FlightComparisonResult,
  FlightFareOffer,
  TravelScope,
  TripType,
} from '../types.ts';
import {
  BRAZILIAN_AIRPORTS,
  BRAZILIAN_INTERNATIONAL_AIRPORTS,
  INTERNATIONAL_DESTINATIONS,
} from '../data/airports.ts';
import {useAuth} from '../contexts/AuthContext.tsx';
import {buildWhatsAppDeepLink, formatWhatsAppPromoMessage} from '../utils/affiliate.ts';
import {formatBRL} from '../utils/format.ts';

interface TravelFlightsViewProps {
  botConfig: BotConfig;
  memberMode?: boolean;
  onRequireAuth?: (mode?: 'login' | 'signup') => void;
  controlledScope?: TravelScope;
  onScopeChange?: (scope: TravelScope) => void;
}

interface AirportComboboxProps {
  label: string;
  airports: Airport[];
  selectedIata: string;
  onSelect: (iata: string) => void;
  helperText?: string;
  showInternationalTag?: boolean;
}

const AirportCombobox: React.FC<AirportComboboxProps> = ({
  label,
  airports,
  selectedIata,
  onSelect,
  helperText,
  showInternationalTag = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = airports.find((a) => a.iata === selectedIata) || airports[0];

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return airports;
    return airports.filter(
      (a) =>
        a.iata.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.stateOrCountry.toLowerCase().includes(q) ||
        a.region.toLowerCase().includes(q),
    );
  }, [airports, query]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
        {helperText && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{helperText}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-left flex items-center justify-between gap-2 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 shrink-0">
            {selected?.iata}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
              {selected?.city} ({selected?.stateOrCountry})
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {selected?.name}
            </p>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
          <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cidade, estado, país ou sigla IATA..."
                className="w-full min-h-[36px] pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {filtered.length === 0 ? (
              <p className="p-4 text-xs text-center text-zinc-500 dark:text-zinc-400">
                Nenhum aeroporto encontrado para &ldquo;{query}&rdquo;.
              </p>
            ) : (
              filtered.map((airport) => {
                const isSelected = airport.iata === selected?.iata;
                return (
                  <button
                    key={airport.iata}
                    type="button"
                    onClick={() => {
                      onSelect(airport.iata);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-amber-50 dark:bg-yellow-400/10'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                        {airport.city} · {airport.stateOrCountry}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {airport.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {showInternationalTag && airport.isBrazilian && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                            airport.hasInternationalFlights
                              ? 'bg-amber-500/15 text-amber-700 dark:text-yellow-400'
                              : 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {airport.hasInternationalFlights ? 'Internacional' : 'Via conexão BR'}
                        </span>
                      )}
                      <span className="font-mono-num text-xs font-bold text-amber-700 dark:text-yellow-400">
                        {airport.iata}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export const TravelFlightsView: React.FC<TravelFlightsViewProps> = ({
  botConfig,
  memberMode = false,
  onRequireAuth,
  controlledScope,
  onScopeChange,
}) => {
  const {user, isDealSaved, toggleSaveDeal} = useAuth();
  const initialScope: TravelScope = controlledScope ?? 'national';
  const [scope, setScope] = useState<TravelScope>(initialScope);
  const [intlDirection, setIntlDirection] = useState<'br_to_intl' | 'intl_to_br'>('br_to_intl');
  const [originIata, setOriginIata] = useState<string>(
    initialScope === 'international' ? 'VIX' : 'VIX',
  );
  const [destIata, setDestIata] = useState<string>(
    initialScope === 'international' ? 'LIS' : 'GRU',
  );
  const [connectionHubIata, setConnectionHubIata] = useState<string>('auto');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  const [tripType, setTripType] = useState<TripType>('roundtrip');
  const [departureDate, setDepartureDate] = useState<string>(() =>
    new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
  );
  const [returnDate, setReturnDate] = useState<string>(() =>
    new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
  );
  const [passengers, setPassengers] = useState<number>(1);
  const [cabinClass, setCabinClass] = useState<'Econômica' | 'Econômica Premium' | 'Executiva'>(
    'Econômica',
  );

  const [sortBy, setSortBy] = useState<'price' | 'duration' | 'stops'>('price');
  const [directOnly, setDirectOnly] = useState<boolean>(false);
  const [ticketModeFilter, setTicketModeFilter] = useState<'all' | 'single' | 'split'>('all');
  const [airlineFilter, setAirlineFilter] = useState<string>('all');
  const [avoidThirdParty, setAvoidThirdParty] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlightComparisonResult | null>(null);
  const [alertTargetPrice, setAlertTargetPrice] = useState<string>('');
  const [creatingAlert, setCreatingAlert] = useState<boolean>(false);
  const [alertSavedMsg, setAlertSavedMsg] = useState<string | null>(null);

  const filteredIntlAirports = useMemo(() => {
    if (regionFilter === 'all') return INTERNATIONAL_DESTINATIONS;
    return INTERNATIONAL_DESTINATIONS.filter((d) => d.region === regionFilter);
  }, [regionFilter]);

  const originPool = useMemo(() => {
    if (scope === 'national') return BRAZILIAN_AIRPORTS;
    return intlDirection === 'br_to_intl' ? BRAZILIAN_AIRPORTS : filteredIntlAirports;
  }, [scope, intlDirection, filteredIntlAirports]);

  const destPool = useMemo(() => {
    if (scope === 'national') return BRAZILIAN_AIRPORTS;
    return intlDirection === 'br_to_intl' ? filteredIntlAirports : BRAZILIAN_AIRPORTS;
  }, [scope, intlDirection, filteredIntlAirports]);

  const selectedBrazilianAirport = useMemo(() => {
    if (scope !== 'international') return null;
    const code = intlDirection === 'br_to_intl' ? originIata : destIata;
    return BRAZILIAN_AIRPORTS.find((a) => a.iata === code) || null;
  }, [scope, intlDirection, originIata, destIata]);

  const isNonInternationalOrigin = Boolean(
    scope === 'international' &&
      selectedBrazilianAirport &&
      !selectedBrazilianAirport.hasInternationalFlights,
  );

  const availableConnectionHubs = useMemo(() => {
    return BRAZILIAN_INTERNATIONAL_AIRPORTS.filter(
      (h) => h.iata !== selectedBrazilianAirport?.iata,
    );
  }, [selectedBrazilianAirport]);

  const internationalRegions = useMemo(() => {
    const set = new Set<string>();
    INTERNATIONAL_DESTINATIONS.forEach((d) => set.add(d.region));
    return Array.from(set);
  }, []);

  const runSearch = async (params?: {
    nextScope?: TravelScope;
    nextOrigin?: string;
    nextDest?: string;
    nextConnectionHub?: string;
    nextTripType?: TripType;
    nextAvoidThirdParty?: boolean;
    forceRefresh?: boolean;
  }) => {
    const s = params?.nextScope ?? scope;
    const orig = params?.nextOrigin ?? originIata;
    const dest = params?.nextDest ?? destIata;
    const hub = params?.nextConnectionHub ?? connectionHubIata;
    const tType = params?.nextTripType ?? tripType;
    const avoid = params?.nextAvoidThirdParty ?? avoidThirdParty;
    const forceRefresh = params?.forceRefresh === true;

    setLoading(true);
    setError(null);
    setAlertSavedMsg(null);
    setAirlineFilter('all');
    setTicketModeFilter('all');
    try {
      const resp = await fetch('/api/flights/compare', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          scope: s,
          originIata: orig,
          destinationIata: dest,
          connectionHubIata: s === 'international' ? hub : undefined,
          departureDate: tType === 'returnonly' ? returnDate : departureDate,
          returnDate: tType === 'roundtrip' || tType === 'returnonly' ? returnDate : undefined,
          tripType: tType,
          passengers,
          cabinClass,
          avoidThirdParty: avoid,
          forceRefresh,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError((data as {error?: string}).error || 'Não foi possível comparar os voos.');
        return;
      }
      const typed = data as FlightComparisonResult;
      setResult(typed);
      setAlertTargetPrice(
        typed.lowestPrice > 0 ? String(Math.round(typed.lowestPrice * 0.95)) : '',
      );
    } catch {
      setError('Erro de comunicação ao buscar tarifas aéreas ao vivo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScopeSwitch = (nextScope: TravelScope, fromExternal = false) => {
    setScope(nextScope);
    if (!fromExternal) {
      onScopeChange?.(nextScope);
    }
    setDirectOnly(false);
    setTicketModeFilter('all');
    setRegionFilter('all');
    setConnectionHubIata('auto');
    const isReturnOnly = tripType === 'returnonly';

    if (nextScope === 'international') {
      if (isReturnOnly) {
        setIntlDirection('intl_to_br');
        const nextOrigin = 'LIS';
        const nextDest = BRAZILIAN_AIRPORTS.some((a) => a.iata === originIata) ? originIata : 'VIX';
        setOriginIata(nextOrigin);
        setDestIata(nextDest);
        void runSearch({
          nextScope,
          nextOrigin,
          nextDest,
          nextConnectionHub: 'auto',
          nextTripType: tripType,
        });
      } else {
        setIntlDirection('br_to_intl');
        const validBrOrigin = BRAZILIAN_AIRPORTS.some((a) => a.iata === originIata)
          ? originIata
          : 'VIX';
        const defaultDest = 'LIS';
        setOriginIata(validBrOrigin);
        setDestIata(defaultDest);
        void runSearch({
          nextScope,
          nextOrigin: validBrOrigin,
          nextDest: defaultDest,
          nextConnectionHub: 'auto',
          nextTripType: tripType,
        });
      }
    } else {
      const nextOrigin = isReturnOnly ? 'GRU' : 'VIX';
      const nextDest = isReturnOnly ? 'VIX' : 'GRU';
      setOriginIata(nextOrigin);
      setDestIata(nextDest);
      void runSearch({
        nextScope,
        nextOrigin,
        nextDest,
        nextConnectionHub: 'auto',
        nextTripType: tripType,
      });
    }
  };

  useEffect(() => {
    if (controlledScope && controlledScope !== scope) {
      handleScopeSwitch(controlledScope, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledScope]);

  const handleTripTypeChange = (nextTripType: TripType) => {
    if (nextTripType === tripType) return;
    const wasReturnOnly = tripType === 'returnonly';
    const willBeReturnOnly = nextTripType === 'returnonly';
    setTripType(nextTripType);

    if (wasReturnOnly !== willBeReturnOnly) {
      const nextOrigin = destIata;
      const nextDest = originIata;
      if (scope === 'international') {
        setIntlDirection((prev) => (prev === 'br_to_intl' ? 'intl_to_br' : 'br_to_intl'));
      }
      setOriginIata(nextOrigin);
      setDestIata(nextDest);
      void runSearch({nextOrigin, nextDest, nextTripType});
    } else {
      void runSearch({nextTripType});
    }
  };

  const handleSwapAirports = () => {
    const prevO = originIata;
    const prevD = destIata;
    if (scope === 'international') {
      setIntlDirection((prev) => (prev === 'br_to_intl' ? 'intl_to_br' : 'br_to_intl'));
    }
    setOriginIata(prevD);
    setDestIata(prevO);
    void runSearch({nextOrigin: prevD, nextDest: prevO});
  };

  const uniqueAirlines = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, string>();
    for (const o of result.offers) {
      if (!map.has(o.airlineName)) {
        map.set(o.airlineName, o.airlineCode);
      }
    }
    return Array.from(map.entries()).map(([name, code]) => ({name, code}));
  }, [result]);

  const hasSplitOffers = useMemo(
    () => Boolean(result?.offers.some((o) => o.isSplitConnection)),
    [result],
  );
  const hasSingleTicketOffers = useMemo(
    () => Boolean(result?.offers.some((o) => !o.isSplitConnection)),
    [result],
  );

  const displayedOffers = useMemo(() => {
    if (!result) return [];
    let list = [...result.offers];
    if (directOnly) {
      list = list.filter((o) => o.stops === 0);
    }
    if (ticketModeFilter === 'single') {
      list = list.filter((o) => !o.isSplitConnection);
    } else if (ticketModeFilter === 'split') {
      list = list.filter((o) => Boolean(o.isSplitConnection));
    }
    if (airlineFilter !== 'all') {
      list = list.filter((o) => o.airlineName === airlineFilter);
    }
    list.sort((a, b) => {
      if (sortBy === 'duration') return a.durationMinutes - b.durationMinutes;
      if (sortBy === 'stops') return a.stops - b.stops || a.roundTripTotal - b.roundTripTotal;
      return a.roundTripTotal - b.roundTripTotal;
    });
    return list;
  }, [result, directOnly, ticketModeFilter, airlineFilter, sortBy]);

  const getBestDirectBookingUrl = (offer: FlightFareOffer) => {
    if (!avoidThirdParty && offer.affiliatePartnerUrl) {
      return offer.affiliatePartnerUrl;
    }
    return offer.hasDirectAirlineDeepLink ? offer.officialUrl : offer.rawUrl;
  };

  const handleCreateRouteAlert = async () => {
    if (!result || result.offers.length === 0) return;
    const best = result.offers[0];
    setCreatingAlert(true);
    setAlertSavedMsg(null);
    try {
      const resp = await fetch('/api/flights/alert', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          scope: result.scope,
          originIata: result.origin.iata,
          destinationIata: result.destination.iata,
          airlineName: best.airlineName,
          price: best.roundTripTotal,
          avgPrice: result.avgPrice,
          targetMaxPrice: Number(alertTargetPrice) || best.roundTripTotal,
          bookingUrl: getBestDirectBookingUrl(best),
        }),
      });
      if (resp.ok) {
        setAlertSavedMsg(
          `Alerta de passagem ${result.origin.iata} → ${result.destination.iata} salvo e enviado para Central de Alertas / WhatsApp.`,
        );
      }
    } finally {
      setCreatingAlert(false);
    }
  };

  const buildOfferWhatsAppLink = (offer: FlightFareOffer) => {
    if (!result) return '#';
    const msg = formatWhatsAppPromoMessage({
      template: botConfig.whatsappTemplate,
      productName: `Passagem ${result.origin.city} (${result.origin.iata}) → ${result.destination.city} (${result.destination.iata}) · ${offer.stopLabel}`,
      storeName: offer.airlineName,
      oldPrice: result.avgPrice,
      newPrice: offer.roundTripTotal,
      discountPercent: Math.max(
        5,
        Math.round(((result.avgPrice - offer.roundTripTotal) / result.avgPrice) * 100),
      ),
      affiliateUrl: getBestDirectBookingUrl(offer),
    });
    return buildWhatsAppDeepLink(botConfig.whatsappPhone, msg);
  };

  return (
    <div className="space-y-6">
      {/* Header & 2 Sub-tabs (Voos Nacionais | Voos Internacionais) */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white tracking-normal">
            {memberMode ? (
              <>
                Promoções de <span className="text-red-600 dark:text-yellow-400">Viagens</span>
              </>
            ) : (
              'Comparador de Passagens Aéreas'
            )}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {memberMode
              ? 'Compare tarifas reais de companhias aéreas nacionais e internacionais, acompanhe o histórico de preços da rota e salve suas passagens favoritas.'
              : 'Compare tarifas de todas as companhias aéreas entre origem e destino, acompanhe o histórico de preços da rota e dispare alertas no WhatsApp.'}
          </p>
        </div>

        {/* 2 Dedicated Tabs requested by user */}
        <div
          role="tablist"
          aria-label="Tipo de voo"
          className="flex flex-wrap sm:inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-200/80 dark:bg-[#13141A] border border-transparent dark:border-zinc-800 shrink-0 self-start lg:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'national'}
            onClick={() => handleScopeSwitch('national')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
              scope === 'national'
                ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>Voos Nacionais ({BRAZILIAN_AIRPORTS.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={scope === 'international'}
            onClick={() => handleScopeSwitch('international')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
              scope === 'international'
                ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>
              Voos Internacionais ({BRAZILIAN_AIRPORTS.length} BR)
            </span>
          </button>
        </div>
      </div>

      {/* Flight Search Card */}
      <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-[#0B0C10]">
              {(
                [
                  {id: 'roundtrip', label: 'Ida e volta'},
                  {id: 'oneway', label: 'Só ida'},
                  {id: 'returnonly', label: 'Só volta'},
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTripTypeChange(t.id)}
                  className={`min-h-[32px] px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    tripType === t.id
                      ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {scope === 'international' && (
              <select
                aria-label="Filtrar continente internacional"
                value={regionFilter}
                onChange={(e) => {
                  const nextReg = e.target.value;
                  setRegionFilter(nextReg);
                  const pool =
                    nextReg === 'all'
                      ? INTERNATIONAL_DESTINATIONS
                      : INTERNATIONAL_DESTINATIONS.filter((d) => d.region === nextReg);
                  if (pool.length > 0) {
                    if (intlDirection === 'br_to_intl' && !pool.some((d) => d.iata === destIata)) {
                      setDestIata(pool[0].iata);
                    } else if (
                      intlDirection === 'intl_to_br' &&
                      !pool.some((d) => d.iata === originIata)
                    ) {
                      setOriginIata(pool[0].iata);
                    }
                  }
                }}
                className="min-h-[34px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-700 dark:text-zinc-200"
              >
                <option value="all">
                  Todos os aeroportos internacionais ({INTERNATIONAL_DESTINATIONS.length})
                </option>
                {internationalRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {scope === 'national'
              ? tripType === 'returnonly'
                ? 'Modo Só volta: escolha de onde está voltando, para onde retorna e a data de volta.'
                : `Cobertura completa: todos os ${BRAZILIAN_AIRPORTS.length} aeroportos comerciais do Brasil (26 estados + DF).`
              : intlDirection === 'intl_to_br'
                ? 'Retorno internacional para qualquer aeroporto brasileiro (com conexão automática em hub internacional do Brasil quando necessário).'
                : 'Saia de qualquer aeroporto do Brasil — aeroportos nacionais conectam automaticamente via um aeroporto internacional brasileiro até o destino final.'}
          </p>
        </div>

        {/* Origin -> Destination Row */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-end">
          <div className="lg:col-span-5">
            <AirportCombobox
              label={
                scope === 'international'
                  ? intlDirection === 'br_to_intl'
                    ? 'Aeroporto de Origem (Brasil)'
                    : tripType === 'returnonly'
                      ? 'Saindo de · Volta (Exterior)'
                      : 'Aeroporto de Origem (Exterior)'
                  : tripType === 'returnonly'
                    ? 'Saindo de · Volta (Brasil)'
                    : 'Aeroporto de Origem (Brasil)'
              }
              helperText={
                scope === 'international'
                  ? intlDirection === 'br_to_intl'
                    ? 'Nacionais e Internacionais'
                    : 'Aeroportos no exterior'
                  : 'Todos os aeroportos do BR'
              }
              showInternationalTag={scope === 'international' && intlDirection === 'br_to_intl'}
              airports={originPool}
              selectedIata={originIata}
              onSelect={(iata) => {
                setOriginIata(iata);
                const nextHub = connectionHubIata === iata ? 'auto' : connectionHubIata;
                if (nextHub !== connectionHubIata) setConnectionHubIata(nextHub);
                setDirectOnly(false);
                void runSearch({nextOrigin: iata, nextConnectionHub: nextHub});
              }}
            />
          </div>

          <div className="lg:col-span-1 flex justify-center">
            <button
              type="button"
              onClick={handleSwapAirports}
              title="Inverter origem e destino (Brasil ↔ Exterior ou trecho nacional)"
              aria-label="Inverter aeroportos"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-center transition-colors text-zinc-700 dark:text-yellow-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-5">
            <AirportCombobox
              label={
                scope === 'international'
                  ? intlDirection === 'br_to_intl'
                    ? 'Aeroporto de Chegada (Exterior)'
                    : tripType === 'returnonly'
                      ? 'Retornando para (Brasil)'
                      : 'Aeroporto de Chegada (Brasil)'
                  : tripType === 'returnonly'
                    ? 'Retornando para (Brasil)'
                    : 'Aeroporto de Chegada (Brasil)'
              }
              helperText={
                scope === 'international'
                  ? intlDirection === 'br_to_intl'
                    ? 'Destinos globais'
                    : 'Nacionais e Internacionais'
                  : 'Todos os aeroportos do BR'
              }
              showInternationalTag={scope === 'international' && intlDirection === 'intl_to_br'}
              airports={destPool}
              selectedIata={destIata}
              onSelect={(iata) => {
                setDestIata(iata);
                const nextHub = connectionHubIata === iata ? 'auto' : connectionHubIata;
                if (nextHub !== connectionHubIata) setConnectionHubIata(nextHub);
                setDirectOnly(false);
                void runSearch({nextDest: iata, nextConnectionHub: nextHub});
              }}
            />
          </div>
        </div>

        {/* Brazilian International Hub Connection Selector (Non-international -> International BR -> Final Destination) */}
        {scope === 'international' && (
          <div
            className={`rounded-xl border p-3.5 space-y-2.5 ${
              isNonInternationalOrigin
                ? 'border-amber-400/50 bg-amber-50/60 dark:bg-yellow-400/[0.06]'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0B0C10]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-zinc-950 dark:text-white flex items-center gap-1.5">
                  <Plane className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                  <span>
                    {isNonInternationalOrigin
                      ? `Conexão em Aeroporto Internacional do Brasil (${
                          intlDirection === 'br_to_intl'
                            ? `${originIata} → Hub BR → ${destIata}`
                            : `${originIata} → Hub BR → ${destIata}`
                        })`
                      : 'Conexão opcional em outro Aeroporto Internacional do Brasil'}
                  </span>
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  {isNonInternationalOrigin && selectedBrazilianAirport
                    ? `${selectedBrazilianAirport.city} (${selectedBrazilianAirport.iata}) não opera voos internacionais diretos. Escolha abaixo qual aeroporto internacional do Brasil usar como ponte (comparamos bilhete único + 2 trechos combinados).`
                    : 'Por padrão buscamos direto do aeroporto escolhido, mas você pode forçar conexão por outro hub internacional brasileiro (ex: GRU, GIG, VCP, CNF).'}
                </p>
              </div>

              <select
                aria-label="Escolher aeroporto internacional de conexão no Brasil"
                value={connectionHubIata}
                onChange={(e) => {
                  const nextHub = e.target.value;
                  setConnectionHubIata(nextHub);
                  void runSearch({nextConnectionHub: nextHub});
                }}
                className="min-h-[36px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-800 dark:text-zinc-100 shrink-0"
              >
                <option value="auto">
                  {isNonInternationalOrigin
                    ? 'Automático (melhor hub internacional)'
                    : 'Sem conexão obrigatória (padrão)'}
                </option>
                {availableConnectionHubs.map((hub) => (
                  <option key={hub.iata} value={hub.iata}>
                    Via {hub.iata} · {hub.city} ({hub.stateOrCountry})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConnectionHubIata('auto');
                  void runSearch({nextConnectionHub: 'auto'});
                }}
                className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  connectionHubIata === 'auto'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                }`}
              >
                {isNonInternationalOrigin ? 'Automático' : 'Padrão'}
              </button>
              {['GRU', 'GIG', 'VCP', 'CNF', 'BSB', 'REC', 'POA']
                .filter((code) => code !== selectedBrazilianAirport?.iata)
                .map((code) => {
                  const hubObj = BRAZILIAN_INTERNATIONAL_AIRPORTS.find((h) => h.iata === code);
                  if (!hubObj) return null;
                  const active = connectionHubIata === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setConnectionHubIata(code);
                        void runSearch({nextConnectionHub: code});
                      }}
                      className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent'
                          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                      }`}
                    >
                      Via {hubObj.iata} ({hubObj.city.split(' ')[0]})
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Dates, Passengers, Cabin & Search Button */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-3 items-end">
          {tripType !== 'returnonly' && (
            <div className={tripType === 'roundtrip' ? 'lg:col-span-3' : 'lg:col-span-4'}>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Data de Ida
              </label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => {
                  const nextDep = e.target.value;
                  setDepartureDate(nextDep);
                  if (returnDate && nextDep > returnDate) {
                    setReturnDate(nextDep);
                  }
                }}
                className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          )}

          {(tripType === 'roundtrip' || tripType === 'returnonly') && (
            <div className={tripType === 'roundtrip' ? 'lg:col-span-3' : 'lg:col-span-4'}>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {tripType === 'returnonly' ? 'Data de Volta (Apenas retorno)' : 'Data de Volta'}
              </label>
              <input
                type="date"
                min={tripType === 'roundtrip' ? departureDate : undefined}
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          )}

          <div className={tripType === 'roundtrip' ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Passageiros
            </label>
            <select
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'adulto' : 'adultos'}
                </option>
              ))}
            </select>
          </div>

          <div className={tripType === 'roundtrip' ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Cabine
            </label>
            <select
              value={cabinClass}
              onChange={(e) =>
                setCabinClass(e.target.value as 'Econômica' | 'Econômica Premium' | 'Executiva')
              }
              className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white"
            >
              <option value="Econômica">Econômica</option>
              <option value="Econômica Premium">Econômica Premium</option>
              <option value="Executiva">Executiva</option>
            </select>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runSearch()}
              className="w-full min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plane className="w-4 h-4" />
              <span>{loading ? 'Buscando...' : 'Comparar Voos'}</span>
            </button>
          </div>
        </div>

        {/* Direct Airline Priority + Force Live Refresh */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={avoidThirdParty}
              onChange={(e) => {
                const next = e.target.checked;
                setAvoidThirdParty(next);
                void runSearch({nextAvoidThirdParty: next});
              }}
              className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
            />
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
            <span>
              Evitar sites de terceiros (tarifas reais ao vivo + reserva direta nas companhias aéreas)
            </span>
          </label>

          <button
            type="button"
            disabled={loading}
            onClick={() => void runSearch({forceRefresh: true})}
            className="min-h-[38px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Consultando tarifas reais...' : 'Atualizar Tarifas Ao Vivo'}</span>
          </button>
        </div>

        {error && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}
      </section>

      {/* Comparison Results & 30-day Fare Chart */}
      {result && (
        <>
          {/* Route Summary KPIs + WhatsApp Route Alert Creator */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {result.origin.city} ({result.origin.iata})
                  {result.connectionHub ? (
                    <>
                      {' '}
                      →{' '}
                      <span className="font-semibold text-amber-700 dark:text-yellow-400">
                        {result.connectionHub.city} ({result.connectionHub.iata})
                      </span>
                    </>
                  ) : null}{' '}
                  → {result.destination.city} ({result.destination.iata}) ·{' '}
                  {result.distanceKm.toLocaleString('pt-BR')} km · {result.offers.length} voos reais em{' '}
                  {uniqueAirlines.length} {uniqueAirlines.length === 1 ? 'opção' : 'opções'}
                </p>
                {result.lowestPrice > 0 ? (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-2xl font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                      {formatBRL(result.lowestPrice)}
                    </span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">
                      Menor preço total real c/ taxas via{' '}
                      <strong className="text-zinc-950 dark:text-white">
                        {result.bestAirlineName}
                      </strong>
                    </span>
                    {result.typicalPriceLow && result.typicalPriceHigh ? (
                      <span className="text-xs font-mono-num text-zinc-500 dark:text-zinc-400">
                        Faixa típica: {formatBRL(result.typicalPriceLow)} –{' '}
                        {formatBRL(result.typicalPriceHigh)}
                      </span>
                    ) : (
                      <span className="text-xs font-mono-num text-zinc-500 dark:text-zinc-400">
                        Média da rota: {formatBRL(result.avgPrice)}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Nenhum voo publicado para estas datas exatas.
                  </p>
                )}
              </div>

              {!memberMode && result.offers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Alertar até R$</span>
                    <input
                      type="number"
                      min={100}
                      value={alertTargetPrice}
                      onChange={(e) => setAlertTargetPrice(e.target.value)}
                      className="w-24 min-h-[38px] px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs font-mono-num text-zinc-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={creatingAlert}
                    onClick={() => void handleCreateRouteAlert()}
                    className="min-h-[38px] px-3.5 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>{creatingAlert ? 'Criando...' : 'Criar Alerta WhatsApp'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="xl:col-span-4 rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4">
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Tendência de preços da rota (últimos 30 dias)
              </p>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.priceHistory} margin={{top: 4, right: 4, left: 0, bottom: 0}}>
                    <defs>
                      <linearGradient id="flightTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FACC15" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#FACC15" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.12)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      content={({active, payload}) => {
                        if (!active || !payload || !payload[0]) return null;
                        const pt = payload[0].payload as {date: string; minPrice: number; avgPrice: number};
                        return (
                          <div className="rounded-lg bg-[#07070A] text-white px-2.5 py-1.5 border border-zinc-800 text-[11px]">
                            <p className="text-zinc-400">{pt.date}</p>
                            <p className="font-mono-num font-bold text-yellow-400">
                              Mín: {formatBRL(pt.minPrice)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minPrice"
                      stroke="#EAB308"
                      strokeWidth={2}
                      fill="url(#flightTrendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {alertSavedMsg && (
            <div className="rounded-xl bg-amber-50 dark:bg-yellow-400/10 border border-amber-300 dark:border-yellow-400/40 px-4 py-3 text-xs font-medium text-amber-900 dark:text-yellow-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{alertSavedMsg}</span>
            </div>
          )}

          {result.groundingSources && result.groundingSources.length > 0 && (
            <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                  <span>Fontes Oficiais Pesquisadas (Sites de terceiros filtrados)</span>
                </p>
                {result.liveSearchSummary && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{result.liveSearchSummary}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {result.groundingSources.slice(0, 8).map((src) => (
                  <a
                    key={src.url}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[32px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-xs text-zinc-700 dark:text-zinc-200 hover:border-yellow-400 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>
                      {src.isOfficialAirline ? 'Site Oficial · ' : ''}
                      {src.domain}
                    </span>
                    <ExternalLink className="w-3 h-3 text-zinc-400" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Filter & Sort Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-xl bg-zinc-200/80 dark:bg-[#13141A] border border-transparent dark:border-zinc-800">
                {(
                  [
                    {id: 'price', label: 'Menor Preço'},
                    {id: 'duration', label: 'Menor Duração'},
                    {id: 'stops', label: 'Menos Paradas'},
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id)}
                    className={`min-h-[34px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      sortBy === opt.id
                        ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {hasSplitOffers && hasSingleTicketOffers && (
                <div className="inline-flex items-center p-1 rounded-xl bg-zinc-200/80 dark:bg-[#13141A] border border-transparent dark:border-zinc-800">
                  {(
                    [
                      {id: 'all', label: 'Todos'},
                      {id: 'single', label: 'Bilhete Único'},
                      {id: 'split', label: '2 Trechos via Hub'},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTicketModeFilter(opt.id)}
                      className={`min-h-[34px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        ticketModeFilter === opt.id
                          ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {!isNonInternationalOrigin && (
                <label className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={directOnly}
                    onChange={(e) => setDirectOnly(e.target.checked)}
                    className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Somente voos diretos</span>
                </label>
              )}

              {uniqueAirlines.length > 1 && (
                <select
                  aria-label="Filtrar companhia aérea"
                  value={airlineFilter}
                  onChange={(e) => setAirlineFilter(e.target.value)}
                  className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] text-xs font-medium text-zinc-700 dark:text-zinc-200"
                >
                  <option value="all">Todas as companhias ({uniqueAirlines.length})</option>
                  {uniqueAirlines.map((al) => (
                    <option key={al.name} value={al.name}>
                      {al.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
              Exibindo {displayedOffers.length} de {result.offers.length} voos reais
            </span>
          </div>

          {/* Airlines Comparison List */}
          <div className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {displayedOffers.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {result.offers.length === 0
                    ? `Nenhum voo publicado encontrado para ${result.origin.iata} → ${result.destination.iata} nessas datas.`
                    : 'Nenhum voo encontrado com os filtros selecionados. Desmarque "Somente voos diretos" ou selecione todas as companhias.'}
                </p>
                {result.offers.length === 0 && result.googleFlightsAllUrl && (
                  <a
                    href={result.googleFlightsAllUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <span>Ver datas próximas no Google Voos</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ) : (
              displayedOffers.map((offer, idx) => {
                const isBest = idx === 0 && sortBy === 'price';
                const diffFromLowest = offer.roundTripTotal - result.lowestPrice;

                return (
                  <div
                    key={offer.id}
                    className={`p-5 sm:p-6 transition-colors ${
                      isBest
                        ? 'bg-amber-50/45 dark:bg-yellow-400/[0.05]'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                    }`}
                  >
                    {/* Top Row: Airline, Schedule & Total Fare */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-4 items-center">
                      {/* Airline Identity */}
                      <div className="md:col-span-4 flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center font-mono-num text-xs font-bold text-white shrink-0"
                          style={{backgroundColor: offer.airlineAccent}}
                        >
                          {offer.airlineCode}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <p className="text-sm font-semibold text-zinc-950 dark:text-white leading-snug">
                              {offer.airlineName}
                            </p>
                            {isBest && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-yellow-400 shrink-0">
                                <Check className="w-3.5 h-3.5" />
                                <span>Mais barato</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-num leading-relaxed">
                            Voo {offer.flightNumber}
                            {offer.aircraft ? ` · ${offer.aircraft}` : ''} · {offer.cabinClass}
                          </p>
                        </div>
                      </div>

                      {/* Times & Duration */}
                      <div className="md:col-span-5 flex items-center gap-4">
                        <div className="shrink-0">
                          <p className="text-base font-bold font-mono-num text-zinc-950 dark:text-white leading-tight">
                            {offer.departureTime}
                          </p>
                          <p className="mt-0.5 text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400">
                            {result.origin.iata}
                          </p>
                        </div>

                        <div className="flex-1 min-w-[110px] px-1 text-center">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center justify-center gap-1.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{formatDuration(offer.durationMinutes)}</span>
                          </p>
                          <div className="my-1.5 h-px bg-zinc-200 dark:bg-zinc-700 relative">
                            <span
                              className={`block w-2 h-2 rounded-full mx-auto -mt-[3.5px] ${
                                offer.stops === 0 ? 'bg-yellow-400' : 'bg-red-500'
                              }`}
                            />
                          </div>
                          <p
                            className={`text-[11px] font-medium leading-snug ${
                              offer.stops === 0
                                ? 'text-amber-700 dark:text-yellow-400'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {offer.stopLabel}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold font-mono-num text-zinc-950 dark:text-white leading-tight">
                            {offer.arrivalTime}
                          </p>
                          <p className="mt-0.5 text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400">
                            {result.destination.iata}
                          </p>
                        </div>
                      </div>

                      {/* Total Fare Price */}
                      <div className="md:col-span-3 md:text-right space-y-1">
                        <p className="text-xl font-bold font-mono-num text-amber-700 dark:text-yellow-400 leading-tight">
                          {formatBRL(offer.roundTripTotal)}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          Total real c/ taxas ·{' '}
                          {result.tripType === 'roundtrip'
                            ? 'Ida e volta'
                            : result.tripType === 'returnonly'
                              ? 'Só volta'
                              : 'Só ida'}{' '}
                          ({result.passengers} {result.passengers === 1 ? 'adulto' : 'adultos'})
                          {diffFromLowest > 0 ? ` · +${formatBRL(diffFromLowest)}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* 2-Leg Breakdown (Non-international -> International Hub -> Final Destination) */}
                    {offer.isSplitConnection && offer.legs && (
                      <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-50/40 dark:bg-[#0B0C10] p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-amber-800 dark:text-yellow-400">
                            Rota combinada em 2 trechos via {offer.connectionHubCity || offer.connectionHubIata} ({offer.connectionHubIata})
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Recomenda-se folga mínima de 3h na conexão internacional
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {offer.legs.map((leg, legIdx) => {
                            const legUrl = !avoidThirdParty && leg.affiliatePartnerUrl
                              ? leg.affiliatePartnerUrl
                              : leg.hasDirectAirlineDeepLink
                                ? leg.officialUrl
                                : leg.rawUrl;
                            return (
                              <div
                                key={`${offer.id}-leg-${legIdx}`}
                                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141A] p-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-[11px] font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-zinc-900 dark:bg-zinc-800 text-white font-mono-num text-[10px]">
                                      Trecho {legIdx + 1}
                                    </span>
                                    <span className="font-mono-num">
                                      {leg.originIata} → {leg.destinationIata}
                                    </span>
                                  </p>
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                    {leg.airlineName} · {leg.flightNumber}
                                  </p>
                                  <p className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400">
                                    {leg.departureTime} → {leg.arrivalTime} · {formatDuration(leg.durationMinutes)} · {leg.stopLabel}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 space-y-1">
                                  <p className="text-sm font-bold font-mono-num text-amber-700 dark:text-yellow-400">
                                    {formatBRL(leg.priceBrl)}
                                  </p>
                                  <a
                                    href={legUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[30px] px-2.5 rounded-lg bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-90 whitespace-nowrap"
                                  >
                                    <span>Trecho {legIdx + 1}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bottom Bar: Baggage / Miles / Official Source + Action Buttons */}
                    <div className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                          <Luggage className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{offer.baggageIncluded}</span>
                        </span>
                        <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono-num text-[11px]">
                          Ou aprox. {offer.milesEstimate.toLocaleString('pt-BR')} milhas
                        </span>
                        <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={
                            offer.isLiveVerified
                              ? 'text-[11px] font-semibold text-amber-700 dark:text-yellow-400'
                              : 'text-[11px]'
                          }
                        >
                          {offer.sourceLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {memberMode ? (
                          (() => {
                            const effectiveDate =
                              result.tripType === 'returnonly'
                                ? result.returnDate || returnDate
                                : result.departureDate;
                            const flightDealKey = `flight_${result.origin.iata}_${result.destination.iata}_${offer.flightNumber}_${effectiveDate}_${result.tripType}`;
                            const saved = isDealSaved(flightDealKey);
                            const tripSuffix =
                              result.tripType === 'returnonly'
                                ? ' · Só volta'
                                : result.tripType === 'oneway'
                                  ? ' · Só ida'
                                  : '';
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!user) {
                                    onRequireAuth?.('login');
                                    return;
                                  }
                                  void toggleSaveDeal({
                                    rawId: flightDealKey,
                                    dealType: 'flight',
                                    title: `Voo ${result.origin.city} (${result.origin.iata}) → ${result.destination.city} (${result.destination.iata}) · ${offer.stopLabel}${tripSuffix}`,
                                    storeOrAirline: offer.airlineName,
                                    price: offer.roundTripTotal,
                                    affiliateUrl: getBestDirectBookingUrl(offer),
                                  });
                                }}
                                className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                  saved
                                    ? 'bg-yellow-400 text-zinc-950 border-transparent'
                                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                              >
                                {saved ? (
                                  <BookmarkCheck className="w-3.5 h-3.5" />
                                ) : (
                                  <Bookmark className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                                )}
                                <span>{saved ? 'Salvo' : 'Salvar'}</span>
                              </button>
                            );
                          })()
                        ) : (
                          <a
                            href={buildOfferWhatsAppLink(offer)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {offer.isSplitConnection && offer.legs ? (
                          <>
                            <a
                              href={
                                avoidThirdParty
                                  ? offer.legs[0].hasDirectAirlineDeepLink
                                    ? offer.legs[0].officialUrl
                                    : offer.legs[0].rawUrl
                                  : offer.legs[0].affiliatePartnerUrl || offer.legs[0].rawUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                            >
                              <span>
                                1º {offer.legs[0].originIata}→{offer.legs[0].destinationIata}
                              </span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={
                                avoidThirdParty
                                  ? offer.legs[1].hasDirectAirlineDeepLink
                                    ? offer.legs[1].officialUrl
                                    : offer.legs[1].rawUrl
                                  : offer.legs[1].affiliatePartnerUrl || offer.legs[1].rawUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                isBest
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-zinc-950 dark:bg-zinc-800 hover:opacity-90 text-white'
                              }`}
                            >
                              <span>
                                2º {offer.legs[1].originIata}→{offer.legs[1].destinationIata}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </>
                        ) : offer.hasDirectAirlineDeepLink ? (
                          <>
                            <a
                              href={offer.rawUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Abrir opções da ${offer.airlineName} no Google Voos com rota e datas preenchidas`}
                              className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                            >
                              <span>Google Voos</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={avoidThirdParty ? offer.officialUrl : offer.affiliatePartnerUrl || offer.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Abrir tela de seleção de voos diretamente no site oficial da ${offer.airlineName}`}
                              className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                isBest
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-zinc-950 dark:bg-zinc-800 hover:opacity-90 text-white'
                              }`}
                            >
                              <span>
                                {avoidThirdParty
                                  ? `Escolher Voo (${offer.airlineCode})`
                                  : 'Ver Pacote'}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </>
                        ) : (
                          <>
                            <a
                              href={offer.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Portal oficial da ${offer.airlineName} (esta cia exige preenchimento manual no site)`}
                              className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                            >
                              <span>Portal {offer.airlineCode}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={avoidThirdParty ? offer.rawUrl : offer.affiliatePartnerUrl || offer.rawUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Abrir opções da ${offer.airlineName} com rota, datas e cabine preenchidas para reserva direta`}
                              className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                isBest
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-zinc-950 dark:bg-zinc-800 hover:opacity-90 text-white'
                              }`}
                            >
                              <span>
                                {avoidThirdParty
                                  ? `Ver Opções (${offer.airlineCode})`
                                  : 'Ver Pacote'}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
