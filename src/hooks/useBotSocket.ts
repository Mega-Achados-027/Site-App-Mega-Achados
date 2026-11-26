import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  AlertNotification,
  AnnouncedDeal,
  AppStateSnapshot,
  BotConfig,
  CouponSyncMeta,
  DealFeedMeta,
  GroupForwardEntry,
  MonitoredProduct,
  MonthlySavingsEntry,
  StoreConfig,
  StoreCoupon,
} from '../types.ts';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

interface SocketMessage {
  type: string;
  payload: unknown;
  timestamp?: string;
}

export function useBotSocket(onNewAlert?: (alert: AlertNotification) => void) {
  const [state, setState] = useState<AppStateSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onNewAlertRef = useRef(onNewAlert);
  onNewAlertRef.current = onNewAlert;
  const reconnectTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const resp = await fetch('/api/state');
      if (!resp.ok) throw new Error('Falha ao carregar estado do servidor.');
      const data = (await resp.json()) as AppStateSnapshot;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    void fetchSnapshot();

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) return;
          setConnectionState('connected');
          setError(null);
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          try {
            const msg = JSON.parse(event.data as string) as SocketMessage;

            switch (msg.type) {
              case 'init':
              case 'state:synced': {
                setState(msg.payload as AppStateSnapshot);
                setIsLoading(false);
                break;
              }
              case 'price:updated':
              case 'product:updated': {
                const updated = msg.payload as MonitoredProduct;
                setState((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    products: prev.products.map((p) => (p.id === updated.id ? updated : p)),
                  };
                });
                break;
              }
              case 'product:created': {
                const created = msg.payload as MonitoredProduct;
                setState((prev) => {
                  if (!prev) return prev;
                  if (prev.products.some((p) => p.id === created.id)) return prev;
                  return {
                    ...prev,
                    products: [created, ...prev.products],
                  };
                });
                break;
              }
              case 'product:deleted': {
                const {id} = msg.payload as {id: string};
                setState((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    products: prev.products.filter((p) => p.id !== id),
                  };
                });
                break;
              }
              case 'alert:triggered': {
                const alert = msg.payload as AlertNotification;
                setState((prev) => {
                  if (!prev) return prev;
                  if (prev.alerts.some((a) => a.id === alert.id)) return prev;
                  return {
                    ...prev,
                    alerts: [alert, ...prev.alerts].slice(0, 60),
                  };
                });
                onNewAlertRef.current?.(alert);
                break;
              }
              case 'alert:updated': {
                const updated = msg.payload as AlertNotification;
                setState((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    alerts: prev.alerts.map((a) => (a.id === updated.id ? updated : a)),
                  };
                });
                break;
              }
              case 'alerts:synced': {
                const alerts = msg.payload as AlertNotification[];
                setState((prev) => (prev ? {...prev, alerts} : prev));
                break;
              }
              case 'store:created': {
                const created = msg.payload as StoreConfig;
                setState((prev) => {
                  if (!prev) return prev;
                  if (prev.stores.some((s) => s.id === created.id)) return prev;
                  return {
                    ...prev,
                    stores: [...prev.stores, created],
                  };
                });
                break;
              }
              case 'store:updated': {
                const updated = msg.payload as StoreConfig;
                setState((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    stores: prev.stores.map((s) => (s.id === updated.id ? updated : s)),
                  };
                });
                break;
              }
              case 'store:deleted': {
                const {id} = msg.payload as {id: string};
                setState((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    stores: prev.stores.filter((s) => s.id !== id),
                  };
                });
                break;
              }
              case 'savings:updated': {
                const monthlySavings = msg.payload as MonthlySavingsEntry[];
                setState((prev) => (prev ? {...prev, monthlySavings} : prev));
                break;
              }
              case 'bot:updated': {
                const botConfig = msg.payload as BotConfig;
                setState((prev) => (prev ? {...prev, botConfig} : prev));
                break;
              }
              case 'announcedDeals:synced': {
                const announcedDeals = msg.payload as AnnouncedDeal[];
                setState((prev) => (prev ? {...prev, announcedDeals} : prev));
                break;
              }
              case 'dealFeedMeta:synced': {
                const dealFeedMeta = msg.payload as DealFeedMeta;
                setState((prev) => (prev ? {...prev, dealFeedMeta} : prev));
                break;
              }
              case 'coupons:synced': {
                const {coupons, couponMeta} = msg.payload as {
                  coupons: StoreCoupon[];
                  couponMeta: CouponSyncMeta;
                };
                setState((prev) => (prev ? {...prev, coupons, couponMeta} : prev));
                break;
              }
              case 'groupForwardLog:synced': {
                const groupForwardLog = msg.payload as GroupForwardEntry[];
                setState((prev) => (prev ? {...prev, groupForwardLog} : prev));
                break;
              }
              default:
                break;
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setConnectionState('reconnecting');
          reconnectTimerRef.current = window.setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setConnectionState('reconnecting');
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [fetchSnapshot]);

  return {
    state,
    connectionState,
    isLoading,
    error,
    refresh: fetchSnapshot,
  };
}
