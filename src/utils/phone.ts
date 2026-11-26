export function normalizePhoneE164(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return null;

  let normalizedDigits = digitsOnly;
  if (!hasLeadingPlus && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
    // Default Brazilian DDD + local number -> prepend country code 55
    normalizedDigits = `55${digitsOnly}`;
  }

  const candidate = `+${normalizedDigits}`;
  if (!/^\+[0-9]{10,15}$/.test(candidate)) {
    return null;
  }
  return candidate;
}

export function formatPhoneDisplay(e164: string): string {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (!digits) return '';

  // Brazilian number formatting: +55 (DD) 9XXXX-XXXX or +55 (DD) XXXX-XXXX
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('55') && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return `+${digits}`;
}

export function toWhatsAppDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

export function buildDirectWhatsAppLink(phone: string, message: string): string {
  const digits = toWhatsAppDigits(phone);
  const encoded = encodeURIComponent(message);
  if (!digits) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${digits}?text=${encoded}`;
}

export function normalizeWhatsappInviteUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.length > 300) return null;
  if (!/^https:\/\/(chat\.whatsapp\.com|whatsapp\.com)\/[a-zA-Z0-9_\-/?=&.%]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeMatchText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MATCH_STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'sem',
  'em',
  'no',
  'na',
  'por',
  'the',
  'and',
  'pro',
]);

/**
 * Checks whether a deal's title/category matches ANY specific product chosen by a customer
 * for private WhatsApp alerts. Returns false if the customer has NOT chosen any products
 * (strict opt-in per chosen product for private messages).
 */
export function doesDealMatchSelectedProducts(
  productTitle: string,
  category: string,
  selectedProducts: string[],
): boolean {
  if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
    return false;
  }

  const haystack = normalizeMatchText(`${productTitle} ${category}`);
  if (!haystack) return false;

  for (const rawChoice of selectedProducts) {
    const normalizedChoice = normalizeMatchText(rawChoice);
    if (!normalizedChoice) continue;

    // Direct substring match (e.g. customer chose "iPhone 15" or "Air Fryer")
    if (haystack.includes(normalizedChoice)) {
      return true;
    }

    // Token-based match for longer product names chosen from the catalog
    const tokens = normalizedChoice
      .split(' ')
      .filter((t) => t.length >= 2 && !MATCH_STOPWORDS.has(t));
    if (tokens.length === 0) continue;

    const matchedTokens = tokens.filter((t) => haystack.includes(t));
    const requiredMatches = tokens.length <= 2 ? tokens.length : Math.min(3, Math.ceil(tokens.length * 0.6));
    if (matchedTokens.length >= requiredMatches) {
      return true;
    }
  }

  return false;
}
