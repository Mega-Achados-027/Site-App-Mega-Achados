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

export interface AppAuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  authProvider: 'google' | 'email' | 'phone';
}

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

export interface CredentialRegisterInput {
  method: 'email' | 'phone';
  identifier: string;
  password: string;
  displayName?: string;
  preferredCategories?: string[];
  whatsappPhone?: string;
}

interface PendingSignupDraft {
  displayName?: string;
  preferredCategories?: string[];
  whatsappPhone?: string;
}

interface AuthContextValue {
  user: AppAuthUser | null;
  profile: UserProfileData | null;
  isAdmin: boolean;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  authErrorCode: string | null;
  authErrorSource: 'google' | 'credentials' | null;
  savedDeals: SavedDealItem[];
  forwarderSettings: WhatsappForwarderSettings | null;
  whatsappSubscription: WhatsappSubscriber | null;
  adminSubscribers: WhatsappSubscriber[];
  clearAuthError: () => void;
  signInWithGoogle: (draft?: PendingSignupDraft) => Promise<boolean>;
  signInWithGoogleRedirect: (draft?: PendingSignupDraft) => Promise<void>;
  registerWithCredentials: (input: CredentialRegisterInput) => Promise<boolean>;
  loginWithCredentials: (identifier: string, password: string) => Promise<boolean>;
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

function mapFirebaseUser(u: User): AppAuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    phoneNumber: u.phoneNumber,
    photoURL: u.photoURL,
    authProvider: 'google',
  };
}

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [localUser, setLocalUser] = useState<AppAuthUser | null>(null);
  const localTokenRef = useRef<string | null>(null);

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [authErrorSource, setAuthErrorSource] = useState<'google' | 'credentials' | null>(null);
  const [savedDeals, setSavedDeals] = useState<SavedDealItem[]>([]);
  const [forwarderSettings, setForwarderSettings] = useState<WhatsappForwarderSettings | null>(null);
  const [whatsappSubscription, setWhatsappSubscription] = useState<WhatsappSubscriber | null>(null);
  const [adminSubscribers, setAdminSubscribers] = useState<WhatsappSubscriber[]>([]);
  const pendingDraftRef = useRef<PendingSignupDraft | null>(null);

  const user: AppAuthUser | null = firebaseUser ? mapFirebaseUser(firebaseUser) : localUser;
  const isFirebaseSession = Boolean(firebaseUser);

  const syncUserDocuments = useCallback(async (fbUser: User, draft?: PendingSignupDraft | null) => {
    const uid = fbUser.uid;
    const email = (fbUser.email || '').trim().slice(0, 160);
    const isBootstrap = fbUser.emailVerified && email.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL;

    let adminFlag = isBootstrap;

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

    const userPath = `users/${uid}`;
    let resolvedProfile: UserProfileData;
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        const displayName = sanitizeDisplayName(draft?.displayName || fbUser.displayName, email);
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
          : sanitizeDisplayName(data.displayName || fbUser.displayName, email);
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

    if (email.length >= 3) {
      const privatePath = `users/${uid}/private/info`;
      try {
        const privSnap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
        const photoUrl = (fbUser.photoURL || '').trim().slice(0, 500);
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
    try {
      const savedDraftRaw = sessionStorage.getItem('megaachados_pending_signup_draft');
      if (savedDraftRaw) {
        sessionStorage.removeItem('megaachados_pending_signup_draft');
        pendingDraftRef.current = JSON.parse(savedDraftRaw) as PendingSignupDraft;
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }

    void getRedirectResult(auth).catch((err: unknown) => {
      const code = typeof (err as {code?: unknown})?.code === 'string' ? (err as {code: string}).code : '';
      if (code && code !== 'auth/no-auth-event') {
        console.error('Google Redirect Sign-In error:', code, err);
      }
    });

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);
      if (!nextUser) {
        if (!localTokenRef.current) {
          try {
            const meResp = await fetch('/api/auth/me', {
              method: 'GET',
              credentials: 'same-origin',
            });
            if (meResp.ok) {
              const meData = (await meResp.json()) as {
                token?: string;
                user?: AppAuthUser;
                profile?: UserProfileData;
                savedDeals?: SavedDealItem[];
                whatsappSubscription?: WhatsappSubscriber | null;
                forwarderSettings?: WhatsappForwarderSettings | null;
              };
              if (meData.user && meData.profile) {
                if (meData.token) {
                  localTokenRef.current = meData.token;
                }
                setLocalUser(meData.user);
                setProfile(meData.profile);
                setIsAdmin(false);
                setSavedDeals(Array.isArray(meData.savedDeals) ? meData.savedDeals : []);
                setWhatsappSubscription(meData.whatsappSubscription || null);
                setForwarderSettings(meData.forwarderSettings || null);
                setAdminSubscribers([]);
                setAuthReady(true);
                return;
              }
            }
          } catch {
            // No active cookie session
          }
          setProfile(null);
          setIsAdmin(false);
          setSavedDeals([]);
          setForwarderSettings(null);
          setWhatsappSubscription(null);
          setAdminSubscribers([]);
        }
        setAuthReady(true);
        return;
      }

      // Firebase Google session takes precedence over local session
      localTokenRef.current = null;
      setLocalUser(null);

      try {
        const draft = pendingDraftRef.current;
        pendingDraftRef.current = null;
        await syncUserDocuments(nextUser, draft);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao sincronizar sua conta.';
        setAuthError(msg);
        setAuthErrorCode('sync-error');
        setAuthErrorSource('google');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [syncUserDocuments]);

  // Firestore real-time saved deals listener (Google / Firebase Auth sessions only)
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) {
      if (!localTokenRef.current) setSavedDeals([]);
      return;
    }

    const dealsPath = `users/${firebaseUser.uid}/savedDeals`;
    const dealsQuery = query(
      collection(db, 'users', firebaseUser.uid, 'savedDeals'),
      where('userId', '==', firebaseUser.uid),
    );

    const unsub = onSnapshot(
      dealsQuery,
      (snap) => {
        const items: SavedDealItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            userId: String(data.userId || firebaseUser.uid),
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
  }, [authReady, firebaseUser, profile]);

  // Firestore listener for WhatsApp forwarder settings (Google / Firebase Auth sessions)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      if (!localTokenRef.current) setForwarderSettings(null);
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
  }, [authReady, firebaseUser]);

  // Firestore listener for user's own WhatsApp subscription (Google / Firebase Auth sessions)
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) {
      if (!localTokenRef.current) setWhatsappSubscription(null);
      return;
    }

    const subPath = `whatsappSubscribers/${firebaseUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'whatsappSubscribers', firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setWhatsappSubscription(null);
          return;
        }
        const data = snap.data();
        setWhatsappSubscription({
          uid: String(data.uid || firebaseUser.uid),
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
  }, [authReady, firebaseUser, profile]);

  // Admin-only listener for all linked customer WhatsApp subscribers (Firebase Admin sessions)
  useEffect(() => {
    if (!authReady || !firebaseUser || !isAdmin) {
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
  }, [authReady, firebaseUser, isAdmin]);

  const applyLocalAuthPayload = useCallback(
    (payload: {
      token?: string;
      user: AppAuthUser;
      profile: UserProfileData;
      savedDeals?: SavedDealItem[];
      whatsappSubscription?: WhatsappSubscriber | null;
      forwarderSettings?: WhatsappForwarderSettings | null;
    }) => {
      if (payload.token) {
        localTokenRef.current = payload.token;
      }
      setLocalUser(payload.user);
      setProfile(payload.profile);
      setIsAdmin(false);
      setSavedDeals(Array.isArray(payload.savedDeals) ? payload.savedDeals : []);
      setWhatsappSubscription(payload.whatsappSubscription || null);
      setForwarderSettings(payload.forwarderSettings || null);
      setAdminSubscribers([]);
      setAuthReady(true);
    },
    [],
  );

  const registerWithCredentials = useCallback(
    async (input: CredentialRegisterInput): Promise<boolean> => {
      setAuthBusy(true);
      setAuthError(null);
      setAuthErrorCode(null);
      setAuthErrorSource(null);
      try {
        const resp = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'MegaAchadosApp',
          },
          body: JSON.stringify(input),
        });
        const data = (await resp.json()) as {
          error?: string;
          token?: string;
          user?: AppAuthUser;
          profile?: UserProfileData;
          savedDeals?: SavedDealItem[];
          whatsappSubscription?: WhatsappSubscriber | null;
          forwarderSettings?: WhatsappForwarderSettings | null;
        };
        if (!resp.ok || !data.token || !data.user || !data.profile) {
          setAuthError(data.error || 'Não foi possível criar sua conta. Verifique os dados informados.');
          setAuthErrorCode('credentials-register-error');
          setAuthErrorSource('credentials');
          return false;
        }
        applyLocalAuthPayload({
          token: data.token,
          user: data.user,
          profile: data.profile,
          savedDeals: data.savedDeals,
          whatsappSubscription: data.whatsappSubscription,
          forwarderSettings: data.forwarderSettings,
        });
        return true;
      } catch {
        setAuthError('Falha ao conectar ao servidor para criar sua conta. Tente novamente.');
        setAuthErrorCode('network-error');
        setAuthErrorSource('credentials');
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [applyLocalAuthPayload],
  );

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string): Promise<boolean> => {
      setAuthBusy(true);
      setAuthError(null);
      setAuthErrorCode(null);
      setAuthErrorSource(null);
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'MegaAchadosApp',
          },
          body: JSON.stringify({identifier, password}),
        });
        const data = (await resp.json()) as {
          error?: string;
          token?: string;
          user?: AppAuthUser;
          profile?: UserProfileData;
          savedDeals?: SavedDealItem[];
          whatsappSubscription?: WhatsappSubscriber | null;
          forwarderSettings?: WhatsappForwarderSettings | null;
        };
        if (!resp.ok || !data.token || !data.user || !data.profile) {
          setAuthError(data.error || 'E-mail/celular ou senha incorretos.');
          setAuthErrorCode('credentials-login-error');
          setAuthErrorSource('credentials');
          return false;
        }
        applyLocalAuthPayload({
          token: data.token,
          user: data.user,
          profile: data.profile,
          savedDeals: data.savedDeals,
          whatsappSubscription: data.whatsappSubscription,
          forwarderSettings: data.forwarderSettings,
        });
        return true;
      } catch {
        setAuthError('Falha ao conectar ao servidor para entrar na sua conta. Tente novamente.');
        setAuthErrorCode('network-error');
        setAuthErrorSource('credentials');
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [applyLocalAuthPayload],
  );

  const signInWithGoogle = useCallback(async (draft?: PendingSignupDraft): Promise<boolean> => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthErrorSource(null);
    pendingDraftRef.current = draft || null;
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (err: unknown) {
      let finalErr = err;
      const initialCode =
        typeof (err as {code?: unknown})?.code === 'string' ? (err as {code: string}).code : '';

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

      setAuthErrorSource('google');
      setAuthErrorCode(code || 'unknown');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Login com Google cancelado. Você pode tentar novamente ou entrar com e-mail/celular.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'O navegador bloqueou o popup do Google. Use o botão abaixo ou entre com e-mail/celular.',
        );
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'este domínio';
        setAuthError(
          `O Google Login ainda não está liberado para o domínio ${host}. Você pode entrar agora mesmo usando Celular ou E-mail acima (ou autorizar este domínio no Firebase Console).`,
        );
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Falha de conexão com o Google. Tente novamente ou use e-mail/celular.');
      } else if (
        code === 'auth/internal-error' ||
        code === 'auth/web-storage-unsupported' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/missing-initial-state'
      ) {
        setAuthError(
          `O navegador bloqueou a janela do Google (${code}). Abra em nova aba, use o login sem popup abaixo ou crie sua conta com e-mail/celular.`,
        );
      } else {
        setAuthError(
          `Não foi possível entrar com Google agora (${diagnosticTag}). Use a opção abaixo ou entre com e-mail/celular.`,
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
    setAuthErrorCode(null);
    setAuthErrorSource(null);
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
      setAuthErrorSource('google');
      setAuthErrorCode(code || 'redirect-error');
      setAuthError(
        `Não foi possível iniciar o redirecionamento Google (${code || rawMessage.slice(0, 90) || 'erro'}). Entre usando e-mail ou celular.`,
      );
      setAuthBusy(false);
    }
  }, []);

  const updateUserProfile = useCallback(
    async (displayName: string, preferredCategories: string[]) => {
      if (!user) return;
      const cleanName = sanitizeDisplayName(displayName, user.email);
      const cleanCats = sanitizeCategories(preferredCategories);

      if (!isFirebaseSession && localUser) {
        const resp = await fetch('/api/account/profile', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'MegaAchadosApp',
            ...(localTokenRef.current ? {Authorization: `Bearer ${localTokenRef.current}`} : {}),
          },
          body: JSON.stringify({displayName: cleanName, preferredCategories: cleanCats}),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            user: AppAuthUser;
            profile: UserProfileData;
            whatsappSubscription: WhatsappSubscriber | null;
          };
          setLocalUser(data.user);
          setProfile(data.profile);
          setWhatsappSubscription(data.whatsappSubscription);
        }
        return;
      }

      if (!firebaseUser) return;
      const userPath = `users/${firebaseUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: cleanName,
          preferredCategories: cleanCats,
          updatedAt: serverTimestamp(),
        });
        setProfile((prev) =>
          prev ? {...prev, displayName: cleanName, preferredCategories: cleanCats} : null,
        );

        if (whatsappSubscription) {
          await updateDoc(doc(db, 'whatsappSubscribers', firebaseUser.uid), {
            displayName: cleanName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [user, isFirebaseSession, localUser, firebaseUser, whatsappSubscription],
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

      if (!isFirebaseSession && localUser) {
        const resp = await fetch('/api/account/saved-deals/toggle', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'MegaAchadosApp',
            ...(localTokenRef.current ? {Authorization: `Bearer ${localTokenRef.current}`} : {}),
          },
          body: JSON.stringify({
            id: dealId,
            dealType: input.dealType,
            title: input.title,
            storeOrAirline: input.storeOrAirline,
            price: input.price,
            affiliateUrl: input.affiliateUrl,
          }),
        });
        if (!resp.ok) return false;
        const data = (await resp.json()) as {saved: boolean; savedDeals: SavedDealItem[]};
        setSavedDeals(Array.isArray(data.savedDeals) ? data.savedDeals : []);
        return Boolean(data.saved);
      }

      if (!firebaseUser) return false;
      const dealPath = `users/${firebaseUser.uid}/savedDeals/${dealId}`;
      const existingDeal = savedDeals.find((d) => d.id === dealId);

      if (existingDeal) {
        try {
          await deleteDoc(doc(db, 'users', firebaseUser.uid, 'savedDeals', dealId));
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
          await setDoc(doc(db, 'users', firebaseUser.uid, 'savedDeals', dealId), {
            id: dealId,
            userId: firebaseUser.uid,
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
    [user, profile, isFirebaseSession, localUser, firebaseUser, savedDeals],
  );

  const saveWhatsappSubscription = useCallback(
    async (input: SaveWhatsappSubscriptionInput) => {
      if (!user || !profile) {
        throw new Error('Entre na sua conta antes de vincular seu WhatsApp.');
      }
      const normalizedPhone = normalizePhoneE164(input.phoneNumber);
      if (!normalizedPhone) {
        throw new Error(
          'Informe um número de WhatsApp válido com DDD (ex: (27) 99999-9999 ou +5527999999999).',
        );
      }

      const cleanProducts = sanitizeSelectedProducts(input.selectedProducts);

      if (!isFirebaseSession && localUser) {
        const resp = await fetch('/api/account/whatsapp', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'MegaAchadosApp',
            ...(localTokenRef.current ? {Authorization: `Bearer ${localTokenRef.current}`} : {}),
          },
          body: JSON.stringify({
            phoneNumber: normalizedPhone,
            optIn: Boolean(input.optIn),
            receiveProducts: Boolean(input.receiveProducts),
            receiveFlights: Boolean(input.receiveFlights),
            selectedProducts: cleanProducts,
          }),
        });
        const data = (await resp.json()) as {
          error?: string;
          whatsappSubscription?: WhatsappSubscriber;
        };
        if (!resp.ok || !data.whatsappSubscription) {
          throw new Error(data.error || 'Não foi possível salvar seu WhatsApp.');
        }
        setWhatsappSubscription(data.whatsappSubscription);
        return;
      }

      if (!firebaseUser) return;
      const cleanName = sanitizeDisplayName(profile.displayName || user.displayName, user.email);
      const subPath = `whatsappSubscribers/${firebaseUser.uid}`;
      const subRef = doc(db, 'whatsappSubscribers', firebaseUser.uid);

      try {
        const snap = await getDoc(subRef);
        if (!snap.exists()) {
          await setDoc(subRef, {
            uid: firebaseUser.uid,
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
    [user, profile, isFirebaseSession, localUser, firebaseUser],
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

      if (!isFirebaseSession && localUser) {
        await saveWhatsappSubscription({
          phoneNumber: whatsappSubscription.phoneNumber,
          optIn: whatsappSubscription.optIn,
          receiveProducts: true,
          receiveFlights: whatsappSubscription.receiveFlights,
          selectedProducts: nextList,
        });
        return !exists;
      }

      if (!firebaseUser) return false;
      const subPath = `whatsappSubscribers/${firebaseUser.uid}`;
      try {
        await updateDoc(doc(db, 'whatsappSubscribers', firebaseUser.uid), {
          selectedProducts: nextList,
          receiveProducts: true,
          updatedAt: serverTimestamp(),
        });
        return !exists;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, subPath);
      }
    },
    [user, profile, whatsappSubscription, isFirebaseSession, localUser, firebaseUser, saveWhatsappSubscription],
  );

  const unlinkWhatsappSubscription = useCallback(async () => {
    if (!user) return;
    if (!isFirebaseSession && localUser) {
      await fetch('/api/account/whatsapp', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'MegaAchadosApp',
          ...(localTokenRef.current ? {Authorization: `Bearer ${localTokenRef.current}`} : {}),
        },
      });
      setWhatsappSubscription(null);
      return;
    }

    if (!firebaseUser) return;
    const subPath = `whatsappSubscribers/${firebaseUser.uid}`;
    try {
      await deleteDoc(doc(db, 'whatsappSubscribers', firebaseUser.uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, subPath);
    }
  }, [user, isFirebaseSession, localUser, firebaseUser]);

  const saveForwarderSettings = useCallback(
    async (input: SaveForwarderSettingsInput) => {
      if (!firebaseUser || !isAdmin) {
        throw new Error('Apenas o administrador pode configurar o encaminhador e o grupo.');
      }
      const normalizedPhone = normalizePhoneE164(input.senderPhone);
      if (!normalizedPhone) {
        throw new Error(
          'Informe um número de WhatsApp válido com DDD (ex: (27) 99842-7710 ou +5527998427710).',
        );
      }

      const normalizedInviteUrl = normalizeWhatsappInviteUrl(input.groupInviteUrl);
      if (normalizedInviteUrl === null) {
        throw new Error(
          'O link do grupo precisa ser um link oficial do WhatsApp (https://chat.whatsapp.com/...).',
        );
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
          updatedByUid: firebaseUser.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, settingsPath);
      }
    },
    [firebaseUser, isAdmin],
  );

  const adminToggleSubscriberOptIn = useCallback(
    async (targetUid: string, optIn: boolean) => {
      if (!firebaseUser || !isAdmin) return;
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
    [firebaseUser, isAdmin],
  );

  const adminRemoveSubscriber = useCallback(
    async (targetUid: string) => {
      if (!firebaseUser || !isAdmin) return;
      const subPath = `whatsappSubscribers/${targetUid}`;
      try {
        await deleteDoc(doc(db, 'whatsappSubscribers', targetUid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, subPath);
      }
    },
    [firebaseUser, isAdmin],
  );

  const signOutUser = useCallback(async () => {
    setAuthBusy(true);
    try {
      if (firebaseUser) {
        await signOut(auth);
      }
      if (localUser || localTokenRef.current) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'X-Requested-With': 'MegaAchadosApp',
            ...(localTokenRef.current ? {Authorization: `Bearer ${localTokenRef.current}`} : {}),
          },
        }).catch(() => undefined);
      }
      localTokenRef.current = null;
      setLocalUser(null);
      setProfile(null);
      setIsAdmin(false);
      setSavedDeals([]);
      setForwarderSettings(null);
      setWhatsappSubscription(null);
      setAdminSubscribers([]);
    } finally {
      setAuthBusy(false);
    }
  }, [firebaseUser, localUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        authReady,
        authBusy,
        authError,
        authErrorCode,
        authErrorSource,
        savedDeals,
        forwarderSettings,
        whatsappSubscription,
        adminSubscribers,
        clearAuthError: () => {
          setAuthError(null);
          setAuthErrorCode(null);
          setAuthErrorSource(null);
        },
        signInWithGoogle,
        signInWithGoogleRedirect,
        registerWithCredentials,
        loginWithCredentials,
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
