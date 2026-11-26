import React, {useEffect, useMemo, useState} from 'react';
import {
  Bell,
  Bookmark,
  Check,
  ExternalLink,
  LogIn,
  LogOut,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Unlink,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext.tsx';
import {formatBRL} from '../utils/format.ts';
import {
  buildDirectWhatsAppLink,
  formatPhoneDisplay,
  normalizePhoneE164,
} from '../utils/phone.ts';

const BRAND_LOGO = '/assets/aistudio/ChatGPT_Image_17_de_set._de_2026__08_48_50_36447620.png';

const DEAL_CATEGORIES = [
  'Hardware',
  'Smartphones',
  'Áudio',
  'TV & Casa',
  'Eletroportáteis',
  'Monitores',
  'Voos Nacionais',
  'Voos Internacionais',
];

const QUICK_PRODUCT_SUGGESTIONS = [
  'iPhone',
  'Samsung Galaxy',
  'PlayStation 5',
  'Air Fryer',
  'Notebook',
  'Smart TV',
  'Fone Bluetooth',
  'Cafeteira',
];

interface AuthModalProps {
  initialMode?: 'login' | 'signup';
  availableProducts?: string[];
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'login',
  availableProducts = [],
  onClose,
}) => {
  const {
    user,
    profile,
    isAdmin,
    authBusy,
    authError,
    savedDeals,
    forwarderSettings,
    whatsappSubscription,
    clearAuthError,
    signInWithGoogle,
    updateUserProfile,
    toggleSaveDeal,
    saveWhatsappSubscription,
    unlinkWhatsappSubscription,
    signOutUser,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState<string>(profile?.displayName || '');
  const [signupPhone, setSignupPhone] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    profile?.preferredCategories?.length ? profile.preferredCategories : ['Smartphones', 'Voos Nacionais'],
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Customer WhatsApp phone linking + per-product private selection
  const [waPhoneInput, setWaPhoneInput] = useState<string>(whatsappSubscription?.phoneNumber || '');
  const [waOptIn, setWaOptIn] = useState<boolean>(whatsappSubscription?.optIn ?? true);
  const [waProducts, setWaProducts] = useState<boolean>(
    whatsappSubscription?.receiveProducts ?? true,
  );
  const [waFlights, setWaFlights] = useState<boolean>(whatsappSubscription?.receiveFlights ?? false);
  const [selectedPrivateProducts, setSelectedPrivateProducts] = useState<string[]>(
    whatsappSubscription?.selectedProducts || [],
  );
  const [newProductInput, setNewProductInput] = useState<string>('');
  const [savingWa, setSavingWa] = useState(false);
  const [waFeedback, setWaFeedback] = useState<{type: 'success' | 'error'; text: string} | null>(
    null,
  );

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      if (profile.preferredCategories?.length) {
        setSelectedCategories(profile.preferredCategories);
      }
    }
  }, [profile]);

  useEffect(() => {
    if (whatsappSubscription) {
      setWaPhoneInput(whatsappSubscription.phoneNumber);
      setWaOptIn(whatsappSubscription.optIn);
      setWaProducts(whatsappSubscription.receiveProducts);
      setWaFlights(whatsappSubscription.receiveFlights);
      setSelectedPrivateProducts(whatsappSubscription.selectedProducts || []);
    } else {
      setWaPhoneInput('');
      setWaOptIn(true);
      setWaProducts(true);
      setWaFlights(false);
      setSelectedPrivateProducts([]);
    }
  }, [whatsappSubscription]);

  const productSuggestions = useMemo(() => {
    const merged: string[] = [];
    const seen = new Set<string>();
    const addUnique = (raw: string) => {
      const clean = raw.trim().slice(0, 60);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    };
    availableProducts.slice(0, 6).forEach(addUnique);
    QUICK_PRODUCT_SUGGESTIONS.forEach(addUnique);
    return merged.slice(0, 10);
  }, [availableProducts]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= 8) return prev;
      return [...prev, cat];
    });
  };

  const addPrivateProduct = (rawTerm: string) => {
    const clean = rawTerm.trim().slice(0, 80);
    if (!clean) return;
    setSelectedPrivateProducts((prev) => {
      if (prev.length >= 20) return prev;
      if (prev.some((p) => p.toLowerCase() === clean.toLowerCase())) return prev;
      return [...prev, clean];
    });
    setNewProductInput('');
  };

  const removePrivateProduct = (term: string) => {
    setSelectedPrivateProducts((prev) =>
      prev.filter((p) => p.toLowerCase() !== term.toLowerCase()),
    );
  };

  const handleLogin = async () => {
    const ok = await signInWithGoogle();
    if (ok) onClose();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim().slice(0, 80);
    const trimmedPhone = signupPhone.trim();
    const normalizedSignupPhone = trimmedPhone ? normalizePhoneE164(trimmedPhone) : null;
    const ok = await signInWithGoogle({
      displayName: trimmed || undefined,
      preferredCategories: selectedCategories,
      whatsappPhone: normalizedSignupPhone || undefined,
    });
    if (ok) onClose();
  };

  const handleSaveProfileChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSavingProfile(true);
    setSavedFeedback(false);
    try {
      await updateUserProfile(displayName.trim().slice(0, 80), selectedCategories);
      setSavedFeedback(true);
      window.setTimeout(() => setSavedFeedback(false), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaFeedback(null);

    const normalized = normalizePhoneE164(waPhoneInput);
    if (!normalized) {
      setWaFeedback({
        type: 'error',
        text: 'Informe um número válido com DDD (ex: (27) 99999-9999 ou +5527999999999).',
      });
      return;
    }

    // Include any pending text typed in the product input box automatically
    const pendingTerm = newProductInput.trim().slice(0, 80);
    const finalProducts = pendingTerm
      ? selectedPrivateProducts.some((p) => p.toLowerCase() === pendingTerm.toLowerCase())
        ? selectedPrivateProducts
        : [...selectedPrivateProducts, pendingTerm].slice(0, 20)
      : selectedPrivateProducts;

    setSavingWa(true);
    try {
      await saveWhatsappSubscription({
        phoneNumber: normalized,
        optIn: waOptIn,
        receiveProducts: waProducts,
        receiveFlights: waFlights,
        selectedProducts: finalProducts,
      });
      if (pendingTerm) {
        setSelectedPrivateProducts(finalProducts);
        setNewProductInput('');
      }
      setWaPhoneInput(normalized);
      setWaFeedback({
        type: 'success',
        text:
          finalProducts.length > 0
            ? `WhatsApp salvo! Você receberá no privado apenas os ${finalProducts.length} produto(s) escolhidos.`
            : 'WhatsApp vinculado! Adicione acima os produtos específicos que deseja receber no privado.',
      });
      window.setTimeout(() => setWaFeedback(null), 4500);
    } catch (err) {
      setWaFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível salvar seu WhatsApp.',
      });
    } finally {
      setSavingWa(false);
    }
  };

  const handleUnlinkWhatsapp = async () => {
    setSavingWa(true);
    setWaFeedback(null);
    try {
      await unlinkWhatsappSubscription();
      setWaFeedback({
        type: 'success',
        text: 'Número de WhatsApp desvinculado da sua conta.',
      });
      window.setTimeout(() => setWaFeedback(null), 3500);
    } catch (err) {
      setWaFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao desvincular telefone.',
      });
    } finally {
      setSavingWa(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    onClose();
  };

  const senderReady = Boolean(forwarderSettings?.senderPhone && forwarderSettings.enabled);
  const officialGroupUrl = forwarderSettings?.groupInviteUrl?.trim() || '';
  const officialGroupName = forwarderSettings?.groupName?.trim() || 'Grupo VIP Mega Achados 027';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={user ? 'Minha Conta' : 'Entrar ou Criar Conta'}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={BRAND_LOGO}
              alt="Mega Achados 027"
              className="w-9 h-9 rounded-lg object-cover border border-yellow-400/40 shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-950 dark:text-white truncate">
                {user ? 'Minha Conta · Mega Achados 027' : 'Acesse o Mega Achados 027'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {user
                  ? isAdmin
                    ? 'Conta Administrador (acesso completo ao painel)'
                    : 'Grupo oficial de ofertas + alertas privados sob medida'
                  : 'Entre ou crie sua conta para salvar ofertas e configurar alertas no WhatsApp'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de conta"
            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {!user ? (
          <div className="p-6 space-y-5">
            {/* Mode Switch Tabs: Entrar | Criar Conta */}
            <div
              role="tablist"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#0B0C10] border border-zinc-200/80 dark:border-zinc-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => {
                  setMode('login');
                  clearAuthError();
                }}
                className={`min-h-[40px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  mode === 'login'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => {
                  setMode('signup');
                  clearAuthError();
                }}
                className={`min-h-[40px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  mode === 'signup'
                    ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Criar Conta</span>
              </button>
            </div>

            {mode === 'login' ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  <p className="font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
                    <span>Login seguro em 1 clique</span>
                  </p>
                  <p>
                    Entre no nosso Grupo Oficial do WhatsApp para receber todas as promoções do site, ou escolha produtos específicos na sua conta para receber alertas só deles no privado.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleLogin()}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{authBusy ? 'Conectando...' : 'Entrar com Google'}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Como você quer ser chamado?
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Seu WhatsApp para alertas privados (opcional)
                  </label>
                  <input
                    type="tel"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    placeholder="Ex: (27) 99999-9999"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    No privado você só recebe os produtos que escolher em Minha Conta.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Quais promoções mais te interessam?
                    </label>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-num">
                      {selectedCategories.length}/8
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DEAL_CATEGORIES.map((cat) => {
                      const active = selectedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent font-semibold'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{authBusy ? 'Criando conta...' : 'Criar Conta Grátis com Google'}</span>
                </button>
              </form>
            )}

            {authError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 text-center">
                {authError}
              </p>
            )}
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            {/* Signed-in Identity Summary */}
            <div className="rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profile?.displayName || 'Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover border border-yellow-400/40 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-yellow-400 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
                    {(profile?.displayName || user.email || 'M').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                    {profile?.displayName || user.displayName || 'Membro Mega 027'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 inline-flex items-center gap-1 ${
                  isAdmin
                    ? 'bg-red-600/15 text-red-600 dark:text-yellow-400 border border-yellow-400/30'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isAdmin ? 'Admin' : 'Membro'}</span>
              </span>
            </div>

            {/* Official WhatsApp Group Card (ALL Site Promotions) */}
            <div className="rounded-xl border border-yellow-400/40 bg-amber-50/60 dark:bg-yellow-400/[0.06] p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-600 dark:text-yellow-400 shrink-0" />
                    <span>{officialGroupName} (Todas as Ofertas)</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    Todas as promoções que aparecem no site são encaminhadas automaticamente para o nosso Grupo Oficial do WhatsApp.
                  </p>
                </div>
              </div>

              {officialGroupUrl ? (
                <a
                  href={officialGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Entrar no Grupo Oficial do WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  O link de convite do grupo aparecerá aqui assim que o administrador publicar.
                </p>
              )}
            </div>

            {/* Customer Private WhatsApp Alerts (ONLY Chosen Products) */}
            <form
              onSubmit={handleSaveWhatsapp}
              className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Alertas no Privado (Só Produtos Escolhidos)</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    No privado você recebe <strong>somente</strong> os produtos que você adicionar abaixo. Para ver todas as ofertas, entre no Grupo Oficial acima.
                  </p>
                </div>
                {whatsappSubscription && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      whatsappSubscription.optIn
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {whatsappSubscription.optIn ? 'Ativo' : 'Pausado'}
                  </span>
                )}
              </div>

              {/* Official Forwarder Number Banner */}
              {forwarderSettings?.senderPhone && (
                <div className="rounded-lg bg-white/80 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <span className="text-zinc-500 dark:text-zinc-400">Remetente oficial: </span>
                    <span className="font-mono-num font-bold text-zinc-900 dark:text-white">
                      {forwarderSettings.senderDisplayName} ·{' '}
                      {formatPhoneDisplay(forwarderSettings.senderPhone)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Seu número de WhatsApp (com DDD)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    value={waPhoneInput}
                    onChange={(e) => setWaPhoneInput(e.target.value)}
                    placeholder="Ex: (27) 99999-9999 ou +5527999999999"
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Chosen Specific Products for Private WhatsApp */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Produtos que quero receber no privado
                  </label>
                  <span className="text-[11px] font-mono-num text-zinc-500 dark:text-zinc-400">
                    {selectedPrivateProducts.length}/20
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={80}
                    value={newProductInput}
                    onChange={(e) => setNewProductInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addPrivateProduct(newProductInput);
                      }
                    }}
                    placeholder="Ex: iPhone 15, Air Fryer, PlayStation 5..."
                    className="flex-1 min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#0B0C10] text-xs text-zinc-950 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:focus:ring-emerald-400"
                  />
                  <button
                    type="button"
                    disabled={!newProductInput.trim() || selectedPrivateProducts.length >= 20}
                    onClick={() => addPrivateProduct(newProductInput)}
                    className="min-h-[38px] px-3 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {/* Selected Product Chips */}
                {selectedPrivateProducts.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {selectedPrivateProducts.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                      >
                        <span className="truncate max-w-[200px]">{item}</span>
                        <button
                          type="button"
                          onClick={() => removePrivateProduct(item)}
                          aria-label={`Remover ${item}`}
                          className="p-0.5 rounded hover:bg-emerald-600/20"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Nenhum produto escolhido ainda. Adicione acima ou toque em uma sugestão abaixo:
                  </p>
                )}

                {/* Quick Suggestions */}
                <div className="flex flex-wrap gap-1.5">
                  {productSuggestions
                    .filter(
                      (sug) =>
                        !selectedPrivateProducts.some(
                          (chosen) => chosen.toLowerCase() === sug.toLowerCase(),
                        ),
                    )
                    .slice(0, 6)
                    .map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => addPrivateProduct(sug)}
                        className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#0B0C10] text-[11px] text-zinc-600 dark:text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-700 dark:hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[140px]">{sug}</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Delivery Preferences */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 pt-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waOptIn}
                    onChange={(e) => setWaOptIn(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Receber no privado</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waProducts}
                    onChange={(e) => setWaProducts(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Produtos escolhidos</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waFlights}
                    onChange={(e) => setWaFlights(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Viagens</span>
                </label>
              </div>

              {waFeedback && (
                <p
                  className={`text-xs font-medium ${
                    waFeedback.type === 'success'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {waFeedback.text}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingWa}
                  className="min-h-[38px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {savingWa
                      ? 'Salvando...'
                      : whatsappSubscription
                        ? 'Salvar Alertas Privados'
                        : 'Vincular Telefone'}
                  </span>
                </button>

                {whatsappSubscription && senderReady && forwarderSettings && (
                  <a
                    href={buildDirectWhatsAppLink(
                      forwarderSettings.senderPhone,
                      `Olá ${forwarderSettings.senderDisplayName}! Vinculei meu WhatsApp (${formatPhoneDisplay(
                        whatsappSubscription.phoneNumber,
                      )}) para receber alertas privados de: ${
                        selectedPrivateProducts.length > 0
                          ? selectedPrivateProducts.join(', ')
                          : 'produtos escolhidos na minha conta'
                      }.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 rounded-xl border border-emerald-600/40 bg-white dark:bg-[#0B0C10] text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <span>Confirmar no WhatsApp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {whatsappSubscription && (
                  <button
                    type="button"
                    disabled={savingWa}
                    onClick={() => void handleUnlinkWhatsapp()}
                    className="min-h-[38px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Desvincular</span>
                  </button>
                )}
              </div>
            </form>

            {/* Profile Preferences Editor */}
            <form onSubmit={handleSaveProfileChanges} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Categorias de interesse
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEAL_CATEGORIES.map((cat) => {
                    const active = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`min-h-[32px] px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 border-transparent font-semibold'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[38px] px-4 rounded-xl bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                >
                  {savedFeedback ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>
                    {savingProfile
                      ? 'Salvando...'
                      : savedFeedback
                        ? 'Preferências salvas'
                        : 'Salvar Preferências'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleSignOut()}
                  className="min-h-[38px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              </div>
            </form>

            {/* Saved Deals List */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <p className="text-xs font-semibold text-zinc-950 dark:text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
                <span>Minhas Ofertas Salvas ({savedDeals.length})</span>
              </p>

              {savedDeals.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Você ainda não salvou nenhuma oferta. Clique em &ldquo;Salvar&rdquo; nos cards de produtos ou passagens para guardar aqui.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {savedDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C10] p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                          {deal.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {deal.dealType === 'flight' ? 'Viagem' : 'Produto'} · {deal.storeOrAirline} ·{' '}
                          <span className="font-mono-num font-bold text-amber-700 dark:text-yellow-400">
                            {formatBRL(deal.price)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={deal.affiliateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir oferta ${deal.title}`}
                          className="min-h-[32px] px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <span>Abrir</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            void toggleSaveDeal({
                              rawId: deal.id,
                              dealType: deal.dealType,
                              title: deal.title,
                              storeOrAirline: deal.storeOrAirline,
                              price: deal.price,
                              affiliateUrl: deal.affiliateUrl,
                            })
                          }
                          aria-label={`Remover ${deal.title} dos salvos`}
                          className="min-h-[32px] min-w-[32px] rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
