import React, {useEffect, useState} from 'react';
import {Package} from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

function getFallbackImageUrl(currentUrl: string): string | null {
  if (/^https:\/\/i\.promobit\.com\.br\/(520|300)\//i.test(currentUrl)) {
    return currentUrl.replace(/^https:\/\/i\.promobit\.com\.br\/(520|300)\//i, 'https://i.promobit.com.br/268/');
  }
  if (/^https:\/\/i\.promobit\.com\.br\/268\//i.test(currentUrl)) {
    return currentUrl.replace(/^https:\/\/i\.promobit\.com\.br\/268\//i, 'https://i.promobit.com.br/');
  }
  return null;
}

export const ProductImage: React.FC<ProductImageProps> = ({src, alt, className = ''}) => {
  const [currentSrc, setCurrentSrc] = useState(src || '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src || '');
    setFailed(false);
  }, [src]);

  const handleImageError = () => {
    const fallback = getFallbackImageUrl(currentSrc);
    if (fallback && fallback !== currentSrc) {
      setCurrentSrc(fallback);
      return;
    }
    setFailed(true);
  };

  if (!currentSrc || failed) {
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
