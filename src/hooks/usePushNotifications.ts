import {useCallback, useState} from 'react';
import type {AlertNotification, BotConfig} from '../types.ts';
import {formatBRL} from '../utils/format.ts';

function isWithinQuietHours(start: string, end: string): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) {
    return curMin >= startMin && curMin <= endMin;
  }
  return curMin >= startMin || curMin <= endMin;
}

export function usePushNotifications() {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    isSupported ? Notification.permission : 'unsupported',
  );

  const requestPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  const sendBrowserPush = useCallback(
    async (alert: AlertNotification, botConfig?: BotConfig) => {
      if (!isSupported || Notification.permission !== 'granted') return false;
      if (botConfig) {
        if (!botConfig.pushEnabled) return false;
        if (alert.discountPercent < botConfig.pushMinDiscount) return false;
        if (isWithinQuietHours(botConfig.quietHoursStart, botConfig.quietHoursEnd)) return false;
      }

      const title = `${alert.discountPercent.toFixed(0)}% OFF em ${alert.storeName}`;
      const body = `${alert.productName} por ${formatBRL(alert.newPrice)} (antes ${formatBRL(alert.oldPrice)})`;

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: alert.id,
              data: {url: alert.affiliateUrl},
            });
            return true;
          }
        }
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag: alert.id,
        });
        return true;
      } catch {
        return false;
      }
    },
    [isSupported],
  );

  return {
    isSupported,
    permission,
    requestPermission,
    sendBrowserPush,
  };
}
