import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  browserSessionPersistence,
  getRedirectResult,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../firebase.ts';
import type {WhatsappForwarderSettings, WhatsappSubscriber} from '../types.ts';
import {normalizePhoneE164, normalizeWhatsappInviteUrl} from '../utils/phone.ts';

export interface UserProfileData {
  uid: string;
  displayName: string;
  role: 'member' | 'admin';
  preferredCategories: string[];
}

export interface SavedDealItem {
  id: string;
  userId: string;
  dealType: 'product' | 'flight';
  title: string;
  storeOrAirline: string;
  price: number;
  affiliateUrl: string;
}

export interface SaveDealInput {
  rawId: string;
  dealType: 'product' | 'flight';
  title: string;
  storeOrAirline: string;
  price: number;
  affiliateUrl: string;
}

export interface SaveWhatsappSubscriptionInput {
  phoneNumber: string;
  optIn: boolean;
  receiveProducts: boolean;
  receiveFlights: boolean;
  selectedProducts: string[];
}

export interface SaveForwarderSettingsInput {
  senderPhone: string;
  senderDisplayName: string;
  enabled: boolean;
  welcomeMessage: string;
  groupName: string;
  groupInviteUrl: string;
  autoForwardAllDealsToGroup: boolean;
}

interface PendingSignupDraft {
  displayName?: string;
  preferredCategories?: string[];
  whatsappPhone?: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfileData | null;
  isAdmin: boolean;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  savedDeals: SavedDealItem[];
  forwarderSettings: WhatsappForwarderSettings | null;
  whatsappSubscription: WhatsappSubscriber | null;
  adminSubscribers: WhatsappSubscriber[];
  clearAuthError: () => void;
  signInWithGoogle: (draft?: PendingSignupDraft) => Promise<boolean>;
  signInWithGoogleRedirect: (draft?: PendingSignupDraft) => Promise<void>;
  updateUserProfile: (displayName: string, preferredCategories: string[]) => Promise<void>;
  toggleSaveDeal: (input: SaveDealInput) => Promise<boolean>;
  isDealSaved: (rawId: string) => boolean;
  saveWhatsappSubscription: (input: SaveWhatsappSubscriptionInput) => Promise<void>;
  togglePrivateProductAlert: (productLabel: string) => Promise<boolean>;
  unlinkWhatsappSubscription: () => Promise<void>;
  saveForwarderSettings: (input: SaveForwarderSettingsInput) => Promise<void>;
  adminToggleSubscriberOptIn: (targetUid: string, optIn: boolean) => Promise<void>;
  adminRemoveSubscriber: (targetUid: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Sanitization helpers strictly synced with firebase-blueprint.json limits
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned && ID_REGEX.test(cleaned) ? cleaned : `deal-${Date.now()}`;
}

function sanitizeDisplayName(name: string | null | undefined, email?: string | null): string {
  const fallback = email ? email.split('@')[0] : 'Membro Mega 027';
  const trimmed = (name || fallback).trim().slice(0, 80);
  return trimmed.length >= 1 ? trimmed : 'Membro Mega 027';
}

function sanitizeCategories(list?: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const unique = Array.from(
    new Set(
      list
        .map((c) => String(c || '').trim().slice(0, 40))
        .filter((c) => c.length > 0),
    ),
  );
  return unique.slice(0, 8);
}

function sanitizeSelectedProducts(list?: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of list) {
    const trimmed = String(item || '').trim().slice(0, 80);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(trimmed);
    if (clean.length >= 20) break;
  }
  return clean;
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as Timestamp).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savedDeals, setSavedDeals] = useState<SavedDealItem[]>([]);
  const [forwarderSettings, setForwarderSettings] = useState<WhatsappForwarderSettings | null>(null);
  const [whatsappSubscription, setWhatsappSubscription] = useState<WhatsappSubscriber | null>(null);
  const [adminSubscribers, setAdminSubscribers] = useState<WhatsappSubscriber[]>([]);
  const pendingDraftRef = useRef<PendingSignupDraft | null>(null);

  const syncUserDocuments = useCallback(async (firebaseUser: User, draft?: PendingSignupDraft | null) => {
    const uid = firebaseUser.uid;
    const email = (firebaseUser.email || '').trim().slice(0, 160);
    const isBootstrap =
      firebaseUser.emailVerified && email.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL;

    let adminFlag = isBootstrap;

    // 1. Check / provision admin registry document
    const adminPath = `admins/${uid}`;
    try {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      if (adminSnap.exists()) {
        adminFlag = true;
      } else if (isBootstrap && email.length >= 3) {
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email,
          createdAt: serverTimestamp(),
        });
        adminFlag = true;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, adminPath);
    }

    // 2. Check / provision /users/{uid} (Parent document MUST exist before subcollections & subscriber doc)
    const userPath = `users/${uid}`;
    let resolvedProfile: UserProfileData;
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        const displayName = sanitizeDisplayName(draft?.displayName || firebaseUser.displayName, email);
        const preferredCategories = sanitizeCategories(draft?.preferredCategories);
        const role: 'member' | 'admin' = adminFlag ? 'admin' : 'member';
        await setDoc(doc(db, 'users', uid), {
          uid,
          displayName,
          role,
          preferredCategories,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resolvedProfile = {uid, displayName, role, preferredCategories};
      } else {
        const data = userSnap.data() as Partial<UserProfileData>;
        const existingRole = data.role === 'admin' || adminFlag ? 'admin' : 'member';
        const nextDisplayName = draft?.displayName
          ? sanitizeDisplayName(draft.displayName, email)
          : sanitizeDisplayName(data.displayName || firebaseUser.displayName, email);
        const nextCategories =
          draft?.preferredCategories && draft.preferredCategories.length > 0
            ? sanitizeCategories(draft.preferredCategories)
            : sanitizeCategories(data.preferredCategories);

        if (draft?.displayName || (draft?.preferredCategories && draft.preferredCategories.length > 0)) {
          await updateDoc(doc(db, 'users', uid), {
            displayName: nextDisplayName,
            preferredCategories: nextCategories,
            updatedAt: serverTimestamp(),
          });
        }
        resolvedProfile = {
          uid,
          displayName: nextDisplayName,
          role: existingRole,
          preferredCategories: nextCategories,
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }

    // 3. Check / provision isolated PII document /users/{uid}/private/info
    if (email.length >= 3) {
      const privatePath = `users/${uid}/private/info`;
      try {
        const privSnap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
        const photoUrl = (firebaseUser.photoURL || '').trim().slice(0, 500);
        if (!privSnap.exists()) {
          await setDoc(doc(db, 'users', uid, 'private', 'info'), {
            uid,
            email,
            ...(photoUrl ? {photoUrl} : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, privatePath);
      }
    }

    // 4. Optional initial WhatsApp phone link provided during signup
    if (draft?.whatsappPhone) {
      const normalized = normalizePhoneE164(draft.whatsappPhone);
      if (normalized) {
        const subPath = `whatsappSubscribers/${uid}`;
        try {
          const subSnap = await getDoc(doc(db, 'whatsappSubscribers', uid));
          if (!subSnap.exists()) {
            await setDoc(doc(db, 'whatsappSubscribers', uid), {
              uid,
              displayName: resolvedProfile.displayName,
              phoneNumber: normalized,
              optIn: true,
              receiveProducts: true,
              receiveFlights: false,
              selectedProducts: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(doc(db, 'whatsappSubscribers', uid), {
              displayName: resolvedProfile.displayName,
              phoneNumber: normalized,
              optIn: true,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, subPath);
        }
      }
    }

    setIsAdmin(adminFlag || resolvedProfile.role === 'admin');
    setProfile(resolvedProfile);
  }, []);

  useEffect(() => {
    // Restore any pending signup draft saved prior to redirect login
    try {
      const savedDraftRaw = sessionStorage.getItem('megaachados_pending_signup_draft');
      if (savedDraftRaw) {
        sessionStorage.removeItem('megaachados_pending_signup_draft');
        pendingDraftRef.current = JSON.parse(savedDraftRaw) as PendingSignupDraft;
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }

    // Complete redirect sign-in if the user used the non-popup redirect fallback
    void getRedirectResult(auth).catch((err: unknown) => {
      const code = typeof (err as {code?: unknown})?.code === 'string' ? (err as {code: string}).code : '';
      if (code && code !== 'auth/no-auth-event') {
        console.error('Google Redirect Sign-In error:', code, err);
      }
    });

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setIsAdmin(false);
        setSavedDeals([]);
        setForwarderSettings(null);
        setWhatsappSubscription(null);
        setAdminSubscribers([]);
        setAuthReady(true);
        return;
      }

      try {
        const draft = pendingDraftRef.current;
        pendingDraftRef.current = null;
        await syncUserDocuments(nextUser, draft);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao sincronizar sua conta.';
        setAuthError(msg);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [syncUserDocuments]);

  // Real-time saved deals listener
  useEffect(() => {
    if (!authReady || !user || !profile) {
      setSavedDeals([]);
      return;
    }

    const dealsPath = `users/${user.uid}/savedDeals`;
    const dealsQuery = query(
      collection(db, 'users', user.uid, 'savedDeals'),
      where('userId', '==', user.uid),
    );

    const unsub = onSnapshot(
      dealsQuery,
      (snap) => {
        const items: SavedDealItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            userId: String(data.userId || user.uid),
            dealType: data.dealType === 'flight' ? 'flight' : 'product',
            title: String(data.title || ''),
            storeOrAirline: String(data.storeOrAirline || ''),
            price: Number(data.price || 0),
            affiliateUrl: String(data.affiliateUrl || ''),
          };
        });
        setSavedDeals(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, dealsPath);
      },
    );

    return () => unsub();
  }, [authReady, user, profile]);

  // Real-time listener for Admin-configured WhatsApp Forwarder + Official Group (/whatsappSettings/forwarder)
  useEffect(() => {
    if (!authReady || !user) {
      setForwarderSettings(null);
      return;
    }

    const settingsPath = 'whatsappSettings/forwarder';
    const unsub = onSnapshot(
      doc(db, 'whatsappSettings', 'forwarder'),
      (snap) => {
        if (!snap.exists()) {
          setForwarderSettings(null);
          return;
        }
        const data = snap.data();
        setForwarderSettings({
          senderPhone: String(data.senderPhone || ''),
          senderDisplayName: String(data.senderDisplayName || 'Mega Achados 027'),
          enabled: Boolean(data.enabled),
          welcomeMessage: String(data.welcomeMessage || ''),
          groupName: String(data.groupName || 'Grupo VIP Mega Achados 027'),
          groupInviteUrl: String(data.groupInviteUrl || ''),
          autoForwardAllDealsToGroup:
            typeof data.autoForwardAllDealsToGroup === 'boolean'
              ? data.autoForwardAllDealsToGroup
              : true,
          updatedByUid: String(data.updatedByUid || ''),
          updatedAt: timestampToIso(data.updatedAt),
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, settingsPath);
      },
    );

    return () => unsub();
  }, [authReady, user]);

  // Real-time listener for current user's own WhatsApp linked phone + selected private products
  useEffect(() => {
    if (!authReady || !user || !profile) {
      setWhatsappSubscription(null);
      return;
    }

    const subPath = `whatsappSubscribers/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'whatsappSubscribers', user.uid),
      (snap) => {
        if (!snap.exists()) {
          setWhatsappSubscription(null);
          return;
        }
        const data = snap.data();
        setWhatsappSubscription({
          uid: String(data.uid || user.uid),
          displayName: String(data.displayName || profile.displayName),
          phoneNumber: String(data.phoneNumber || ''),
          optIn: Boolean(data.optIn),
          receiveProducts: Boolean(data.receiveProducts),
          receiveFlights: Boolean(data.receiveFlights),
          selectedProducts: sanitizeSelectedProducts(data.selectedProducts as string[] | undefined),
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, subPath);
      },
    );

    return () => unsub();
  }, [authReady, user, profile]);

  // Admin-only real-time listener for all linked customer WhatsApp subscribers
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAdminSubscribers([]);
      return;
    }

    const subsPath = 'whatsappSubscribers';
    const unsub = onSnapshot(
      collection(db, 'whatsappSubscribers'),
      (snap) => {
        const items: WhatsappSubscriber[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              uid: String(data.uid || d.id),
              displayName: String(data.displayName || 'Cliente'),
              phoneNumber: String(data.phoneNumber || ''),
              optIn: Boolean(data.optIn),
              receiveProducts: Boolean(data.receiveProducts),
              receiveFlights: Boolean(data.receiveFlights),
              selectedProducts: sanitizeSelectedProducts(
                data.selectedProducts as string[] | undefined,
              ),
              createdAt: timestampToIso(data.createdAt),
              updatedAt: timestampToIso(data.updatedAt),
            };
          })
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        setAdminSubscribers(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, subsPath);
      },
    );

    return () => unsub();
  }, [authReady, user, isAdmin]);

  const signInWithGoogle = useCallback(async (draft?: PendingSignupDraft): Promise<boolean> => {
    setAuthBusy(true);
    setAuthError(null);
    pendingDraftRef.current = draft || null;
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (err: unknown) {
      let finalErr = err;
      const initialCode =
        typeof (err as {code?: unknown})?.code === 'string' ? (err as {code: string}).code : '';

      // Retry with session / in-memory persistence if browser storage partitioning or iframe restrictions interfered
      if (
        initialCode === 'auth/internal-error' ||
        initialCode === 'auth/web-storage-unsupported' ||
        initialCode === 'auth/operation-not-supported-in-this-environment' ||
        initialCode === 'auth/missing-initial-state'
      ) {
        for (const fallbackPersistence of [browserSessionPersistence, inMemoryPersistence]) {
          try {
            await setPersistence(auth, fallbackPersistence);
            await signInWithPopup(auth, googleProvider);
            return true;
          } catch (retryErr: unknown) {
            finalErr = retryErr;
          }
        }
      }

      pendingDraftRef.current = null;
      const code =
        typeof (finalErr as {code?: unknown})?.code === 'string'
          ? (finalErr as {code: string}).code
          : '';
      const rawMessage =
        finalErr instanceof Error
          ? finalErr.message
          : typeof finalErr === 'string'
            ? finalErr
            : '';
      const diagnosticTag = code || rawMessage.slice(0, 90) || 'erro-desconhecido';
      console.error('Google Sign-In error:', diagnosticTag, finalErr);

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Login cancelado. Clique novamente para entrar com sua conta Google.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'O navegador bloqueou a janela do Google. Permita popups para este site ou use uma das opções abaixo.',
        );
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'este domínio';
        setAuthError(
          `Domínio não autorizado no Firebase Auth (${host}). Abra o app pelo link oficial ou autorize este domínio no console Firebase.`,
        );
      } else if (code === 'auth/network-request-failed') {
        setAuthError(
          'Falha de conexão com o Google. Verifique sua internet ou desative bloqueadores para este site e tente novamente.',
        );
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'O provedor Google não está habilitado no Firebase Auth. Ative o login com Google nas configurações do projeto.',
        );
      } else if (
        code === 'auth/internal-error' ||
        code === 'auth/web-storage-unsupported' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/missing-initial-state'
      ) {
        setAuthError(
          `O navegador restringiu a janela de login do Google (${code}). Abra o app em uma nova aba ou use o login sem popup abaixo.`,
        );
      } else {
        setAuthError(
          `Não foi possível concluir o login agora (${diagnosticTag}). Tente abrir o app em uma nova aba ou usar o botão abaixo.`,
        );
      }
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signInWithGoogleRedirect = useCallback(async (draft?: PendingSignupDraft): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);
    if (draft) {
      try {
        sessionStorage.setItem('megaachados_pending_signup_draft', JSON.stringify(draft));
      } catch {
        // Ignore storage errors
      }
    }
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        typeof (err as {code?: unknown})?.code === 'string' ? (err as {code: string}).code : '';
      const rawMessage = err instanceof Error ? err.message : String(err || '');
      setAuthError(
        `Não foi possível iniciar o redirecionamento Google (${code || rawMessage.slice(0, 90) || 'erro'}). Abra o app em uma nova aba do navegador.`,
      );
      setAuthBusy(false);
    }
  }, []);

  const updateUserProfile = useCallback(
    async (displayName: string, preferredCategories: string[]) => {
      if (!user) return;
      const cleanName = sanitizeDisplayName(displayName, user.email);
      const cleanCats = sanitizeCategories(preferredCategories);
      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: cleanName,
          preferredCategories: cleanCats,
          updatedAt: serverTimestamp(),
        });
        setProfile((prev) =>
          prev
            ? {...prev, displayName: cleanName, preferredCategories: cleanCats}
            : null,
        );

        if (whatsappSubscription) {
          await updateDoc(doc(db, 'whatsappSubscribers', user.uid), {
            displayName: cleanName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [user, whatsappSubscription],
  );

  const isDealSaved = useCallback(
    (rawId: string) => {
      const cleanId = sanitizeFirestoreId(rawId);
      return savedDeals.some((d) => d.id === cleanId);
    },
    [savedDeals],
  );

  const toggleSaveDeal = useCallback(
    async (input: SaveDealInput): Promise<boolean> => {
      if (!user || !profile) return false;
      const dealId = sanitizeFirestoreId(input.rawId);
      const dealPath = `users/${user.uid}/savedDeals/${dealId}`;
      const existingDeal = savedDeals.find((d) => d.id === dealId);

      if (existingDeal) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'savedDeals', dealId));
          return false;
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, dealPath);
        }
      } else {
        const cleanTitle = input.title.trim().slice(0, 180) || 'Oferta Mega Achados 027';
        const cleanStore = input.storeOrAirline.trim().slice(0, 80) || 'Loja Parceira';
        const cleanUrl = input.affiliateUrl.trim().slice(0, 1200);
        const safeUrl = cleanUrl.length >= 8 ? cleanUrl : 'https://megaachados027.app';
        const safePrice = Math.max(0, Math.min(1000000, Number(input.price) || 0));

        try {
          await setDoc(doc(db, 'users', user.uid, 'savedDeals', dealId), {
            id: dealId,
            userId: user.uid,
            dealType: input.dealType,
            title: cleanTitle,
            storeOrAirline: cleanStore,
            price: safePrice,
            affiliateUrl: safeUrl,
            createdAt: serverTimestamp(),
          });
          return true;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, dealPath);
        }
      }
    },
    [user, profile, savedDeals],
  );

  const saveWhatsappSubscription = useCallback(
    async (input: SaveWhatsappSubscriptionInput) => {
      if (!user || !profile) {
        throw new Error('Entre na sua conta antes de vincular seu WhatsApp.');
      }
      const normalizedPhone = normalizePhoneE164(input.phoneNumber);
      if (!normalizedPhone) {
        throw new Error('Informe um número de WhatsApp válido com DDD (ex: (27) 99999-9999 ou +5527999999999).');
      }

      const cleanName = sanitizeDisplayName(profile.displayName || user.displayName, user.email);
      const cleanProducts = sanitizeSelectedProducts(input.selectedProducts);
      const subPath = `whatsappSubscribers/${user.uid}`;
      const subRef = doc(db, 'whatsappSubscribers', user.uid);

      try {
        const snap = await getDoc(subRef);
        if (!snap.exists()) {
          await setDoc(subRef, {
            uid: user.uid,
            displayName: cleanName,
            phoneNumber: normalizedPhone,
            optIn: Boolean(input.optIn),
            receiveProducts: Boolean(input.receiveProducts),
            receiveFlights: Boolean(input.receiveFlights),
            selectedProducts: cleanProducts,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(subRef, {
            displayName: cleanName,
            phoneNumber: normalizedPhone,
            optIn: Boolean(input.optIn),
            receiveProducts: Boolean(input.receiveProducts),
            receiveFlights: Boolean(input.receiveFlights),
            selectedProducts: cleanProducts,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, subPath);
      }
    },
    [user, profile],
  );

  const togglePrivateProductAlert = useCallback(
    async (productLabel: string): Promise<boolean> => {
      if (!user || !profile || !whatsappSubscription) {
        return false;
      }
      const cleanLabel = String(productLabel || '').trim().slice(0, 80);
      if (!cleanLabel) return false;

      const current = whatsappSubscription.selectedProducts || [];
      const exists = current.some((p) => p.toLowerCase() === cleanLabel.toLowerCase());
      const nextList = exists
        ? current.filter((p) => p.toLowerCase() !== cleanLabel.toLowerCase())
        : sanitizeSelectedProducts([cleanLabel, ...current]);

      const subPath = `whatsappSubscribers/${user.uid}`;
      try {
        await updateDoc(doc(db, 'whatsappSubscribers', user.uid), {
          selectedProducts: nextList,
          receiveProducts: true,
          updatedAt: serverTimestamp(),
        });
        return !exists;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, subPath);
      }
    },
    [user, profile, whatsappSubscription],
  );

  const unlinkWhatsappSubscription = useCallback(async () => {
    if (!user) return;
    const subPath = `whatsappSubscribers/${user.uid}`;
    try {
      await deleteDoc(doc(db, 'whatsappSubscribers', user.uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, subPath);
    }
  }, [user]);

  const saveForwarderSettings = useCallback(
    async (input: SaveForwarderSettingsInput) => {
      if (!user || !isAdmin) {
        throw new Error('Apenas o administrador pode configurar o encaminhador e o grupo.');
      }
      const normalizedPhone = normalizePhoneE164(input.senderPhone);
      if (!normalizedPhone) {
        throw new Error('Informe um número de WhatsApp válido com DDD (ex: (27) 99842-7710 ou +5527998427710).');
      }

      const normalizedInviteUrl = normalizeWhatsappInviteUrl(input.groupInviteUrl);
      if (normalizedInviteUrl === null) {
        throw new Error('O link do grupo precisa ser um link oficial do WhatsApp (https://chat.whatsapp.com/...).');
      }

      const cleanDisplayName =
        (input.senderDisplayName || 'Mega Achados 027').trim().slice(0, 80) || 'Mega Achados 027';
      const cleanGroupName =
        (input.groupName || 'Grupo VIP Mega Achados 027').trim().slice(0, 100) ||
        'Grupo VIP Mega Achados 027';
      const cleanWelcome = String(input.welcomeMessage || '').trim().slice(0, 400);
      const settingsPath = 'whatsappSettings/forwarder';

      try {
        await setDoc(doc(db, 'whatsappSettings', 'forwarder'), {
          senderPhone: normalizedPhone,
          senderDisplayName: cleanDisplayName,
          enabled: Boolean(input.enabled),
          welcomeMessage: cleanWelcome,
          groupName: cleanGroupName,
          groupInviteUrl: normalizedInviteUrl,
          autoForwardAllDealsToGroup: Boolean(input.autoForwardAllDealsToGroup),
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, settingsPath);
      }
    },
    [user, isAdmin],
  );

  const adminToggleSubscriberOptIn = useCallback(
    async (targetUid: string, optIn: boolean) => {
      if (!user || !isAdmin) return;
      const subPath = `whatsappSubscribers/${targetUid}`;
      try {
        await updateDoc(doc(db, 'whatsappSubscribers', targetUid), {
          optIn: Boolean(optIn),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, subPath);
      }
    },
    [user, isAdmin],
  );

  const adminRemoveSubscriber = useCallback(
    async (targetUid: string) => {
      if (!user || !isAdmin) return;
      const subPath = `whatsappSubscribers/${targetUid}`;
      try {
        await deleteDoc(doc(db, 'whatsappSubscribers', targetUid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, subPath);
      }
    },
    [user, isAdmin],
  );

  const signOutUser = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
      setProfile(null);
      setIsAdmin(false);
      setSavedDeals([]);
      setForwarderSettings(null);
      setWhatsappSubscription(null);
      setAdminSubscribers([]);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        authReady,
        authBusy,
        authError,
        savedDeals,
        forwarderSettings,
        whatsappSubscription,
        adminSubscribers,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        signInWithGoogleRedirect,
        updateUserProfile,
        toggleSaveDeal,
        isDealSaved,
        saveWhatsappSubscription,
        togglePrivateProductAlert,
        unlinkWhatsappSubscription,
        saveForwarderSettings,
        adminToggleSubscriberOptIn,
        adminRemoveSubscriber,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
