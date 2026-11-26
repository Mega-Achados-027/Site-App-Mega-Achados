import React, {useEffect, useMemo, useState} from 'react';
import {Package} from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

function buildImageCandidateChain(rawSrc?: string): string[] {
  const trimmed = (rawSrc || '').trim();
  if (!trimmed) return [];

  // Local bundled/public asset paths
  if (trimmed.startsWith('/')) {
    return [trimmed];
  }

  // Upgrade insecure http:// image URLs to https:// to avoid mixed-content blocking
  const httpsUrl = trimmed.replace(/^http:\/\//i, 'https://');
  if (!httpsUrl.startsWith('https://')) return [];

  const proxyOf = (url: string) => `/api/image-proxy?url=${encodeURIComponent(url)}`;
  const candidates: string[] = [];

  if (/^https:\/\/i\.promobit\.com\.br\//i.test(httpsUrl)) {
    // Promobit CDN sits behind GoCache which can block direct browser requests; try direct then proxy & size variants
    const url300 = httpsUrl.replace(/^https:\/\/i\.promobit\.com\.br\/(520|268)\//i, 'https://i.promobit.com.br/300/');
    const url268 = url300.replace(/^https:\/\/i\.promobit\.com\.br\/300\//i, 'https://i.promobit.com.br/268/');
    const urlOrig = url268.replace(/^https:\/\/i\.promobit\.com\.br\/268\//i, 'https://i.promobit.com.br/');
    candidates.push(url300, proxyOf(url300), proxyOf(url268), proxyOf(urlOrig));
  } else {
    candidates.push(httpsUrl, proxyOf(httpsUrl));
  }

  return Array.from(new Set(candidates));
}

export const ProductImage: React.FC<ProductImageProps> = ({src, alt, className = ''}) => {
  const candidates = useMemo(() => buildImageCandidateChain(src), [src]);
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    setAttemptIndex(0);
  }, [src]);

  const currentSrc = candidates[attemptIndex] || '';

  const handleImageError = () => {
    setAttemptIndex((prev) => prev + 1);
  };

  if (!currentSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 ${className}`}
        aria-label={alt}
      >
        <Package className="w-7 h-7 stroke-[1.5]" />
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleImageError}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth < 10 || e.currentTarget.naturalHeight < 10) {
          handleImageError();
        }
      }}
      className={className || 'object-cover'}
    />
  );
};
