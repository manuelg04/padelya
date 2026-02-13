"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

import type { UserRecord } from "@/src/domain/types";
import { getMe, requestOtp, updateAlias, verifyOtp, type ApiError } from "@/src/lib/api/client";
import { USE_MOCK_BACKEND } from "@/src/lib/env";
import { firebaseAuth, isFirebaseClientConfigured } from "@/src/lib/firebase/client";

type SendOtpOptions = {
  recaptchaContainerId?: string;
};

type AuthContextValue = {
  loading: boolean;
  user: UserRecord | null;
  token: string | null;
  prepareRecaptcha: (options?: SendOtpOptions) => Promise<void>;
  sendOtp: (phone: string, options?: SendOtpOptions) => Promise<void>;
  verifyOtpCode: (phone: string, code: string) => Promise<UserRecord>;
  refreshUser: () => Promise<void>;
  saveAlias: (alias: string) => Promise<UserRecord>;
  logout: () => void;
};

const STORAGE_KEY = "padel_auth_token";

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "No se pudo completar la autenticación.";
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const debugSuffix = code ? ` [${code}]` : "";
  switch (code) {
    case "auth/invalid-phone-number":
      return `El número de teléfono no es válido.${debugSuffix}`;
    case "auth/too-many-requests":
      return `Demasiados intentos. Intenta más tarde.${debugSuffix}`;
    case "auth/quota-exceeded":
      return `Se alcanzó el límite de SMS del proyecto Firebase.${debugSuffix}`;
    case "auth/invalid-verification-code":
      return `Código incorrecto.${debugSuffix}`;
    case "auth/code-expired":
      return `Código expirado. Solicita uno nuevo.${debugSuffix}`;
    case "auth/missing-verification-code":
      return `Ingresa el código de verificación.${debugSuffix}`;
    case "auth/captcha-check-failed":
      return `Falló la validación reCAPTCHA. Intenta otra vez.${debugSuffix}`;
    case "auth/invalid-app-credential":
      return `Credencial de app inválida (reCAPTCHA). Revisa dominios autorizados y vuelve a resolver el captcha.${debugSuffix}`;
    default:
      return `No se pudo completar la autenticación.${debugSuffix}`;
  }
}

function ensureFirebaseReady() {
  if (!isFirebaseClientConfigured || !firebaseAuth) {
    throw new Error(
      "Faltan variables de Firebase (API key / App ID). Completa .env.local para usar OTP real.",
    );
  }
}

function getFirebaseAuthOrThrow(): Auth {
  ensureFirebaseReady();
  return firebaseAuth as Auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaWidgetIdRef = useRef<number | null>(null);

  const refreshUser = useCallback(async () => {
    if (USE_MOCK_BACKEND) {
      const currentToken = localStorage.getItem(STORAGE_KEY);
      if (!currentToken) {
        setUser(null);
        setToken(null);
        return;
      }

      try {
        const me = await getMe(currentToken);
        if (!me) {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
          return;
        }
        setToken(currentToken);
        setUser(me);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      }
      return;
    }

    const auth = getFirebaseAuthOrThrow();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setToken(null);
      setUser(null);
      return;
    }

    const firebaseToken = await currentUser.getIdToken();
    const me = await getMe(firebaseToken);
    setToken(firebaseToken);
    setUser(me);
  }, []);

  useEffect(() => {
    let disposed = false;

    if (USE_MOCK_BACKEND) {
      void (async () => {
        await refreshUser();
        if (!disposed) {
          setLoading(false);
        }
      })();

      return () => {
        disposed = true;
      };
    }

    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    const syncAuthState = () => {
      void refreshUser()
        .catch(() => {
          // Keep prior auth state on transient refresh errors.
        })
        .finally(() => {
          if (!disposed) {
            setLoading(false);
          }
        });
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, syncAuthState);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [refreshUser]);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        recaptchaRef.current.clear();
        recaptchaRef.current = null;
      }
      recaptchaWidgetIdRef.current = null;
    };
  }, []);

  const sendOtp = useCallback(async (phone: string, options?: SendOtpOptions) => {
    if (USE_MOCK_BACKEND) {
      await requestOtp(phone);
      return;
    }

    const auth = getFirebaseAuthOrThrow();

    const containerId = options?.recaptchaContainerId ?? "recaptcha-container";
    if (!document.getElementById(containerId)) {
      throw new Error("No se encontró el contenedor reCAPTCHA en la pantalla de login.");
    }

    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, containerId, {
        size: "normal",
        callback: () => {
          // reCAPTCHA solved.
        },
        "expired-callback": () => {
          const grecaptcha = (
            window as unknown as { grecaptcha?: { reset: (id: number) => void } }
          ).grecaptcha;
          if (recaptchaWidgetIdRef.current !== null) {
            grecaptcha?.reset(recaptchaWidgetIdRef.current);
          }
        },
      });
      recaptchaWidgetIdRef.current = await recaptchaRef.current.render();
    }

    try {
      confirmationRef.current = await signInWithPhoneNumber(auth, phone, recaptchaRef.current);
    } catch (error) {
      console.error("Firebase signInWithPhoneNumber error", error);
      const grecaptcha = (
        window as unknown as { grecaptcha?: { reset: (id: number) => void } }
      ).grecaptcha;
      if (recaptchaWidgetIdRef.current !== null) {
        grecaptcha?.reset(recaptchaWidgetIdRef.current);
      }
      throw new Error(mapFirebaseError(error));
    }
  }, []);

  const prepareRecaptcha = useCallback(async (options?: SendOtpOptions) => {
    if (USE_MOCK_BACKEND) {
      return;
    }

    const auth = getFirebaseAuthOrThrow();
    const containerId = options?.recaptchaContainerId ?? "recaptcha-container";
    if (!document.getElementById(containerId) || recaptchaRef.current) {
      return;
    }

    recaptchaRef.current = new RecaptchaVerifier(auth, containerId, {
      size: "normal",
      callback: () => {
        // reCAPTCHA solved.
      },
      "expired-callback": () => {
        const grecaptcha = (
          window as unknown as { grecaptcha?: { reset: (id: number) => void } }
        ).grecaptcha;
        if (recaptchaWidgetIdRef.current !== null) {
          grecaptcha?.reset(recaptchaWidgetIdRef.current);
        }
      },
    });
    recaptchaWidgetIdRef.current = await recaptchaRef.current.render();
  }, []);

  const verifyOtpCode = useCallback(async (phone: string, code: string) => {
    if (USE_MOCK_BACKEND) {
      const result = await verifyOtp(phone, code);
      localStorage.setItem(STORAGE_KEY, result.token);
      setToken(result.token);
      setUser(result.user);
      return result.user;
    }

    getFirebaseAuthOrThrow();

    if (!confirmationRef.current) {
      throw new Error("Primero solicita el código OTP.");
    }

    try {
      const credential = await confirmationRef.current.confirm(code);
      const firebaseToken = await credential.user.getIdToken();
      const me = await getMe(firebaseToken);
      if (!me) {
        throw new Error("No se pudo cargar tu perfil en el backend.");
      }

      setToken(firebaseToken);
      setUser(me);

      confirmationRef.current = null;

      return me;
    } catch (error) {
      console.error("Firebase confirm(code) error", error);
      throw new Error(mapFirebaseError(error));
    }
  }, []);

  const saveAlias = useCallback(
    async (alias: string) => {
      const activeToken = USE_MOCK_BACKEND
        ? token
        : await getFirebaseAuthOrThrow().currentUser?.getIdToken();

      if (!activeToken) {
        throw new Error("Debes iniciar sesión");
      }
      const next = await updateAlias(activeToken, alias);
      setUser(next);
      return next;
    },
    [token],
  );

  const logout = useCallback(() => {
    if (USE_MOCK_BACKEND) {
      localStorage.removeItem(STORAGE_KEY);
      setToken(null);
      setUser(null);
      return;
    }

    void (async () => {
      if (firebaseAuth) {
        await signOut(firebaseAuth);
      }
      setToken(null);
      setUser(null);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user,
      token,
      prepareRecaptcha,
      sendOtp,
      verifyOtpCode,
      refreshUser,
      saveAlias,
      logout,
    }),
    [loading, user, token, prepareRecaptcha, sendOtp, verifyOtpCode, refreshUser, saveAlias, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}

export function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      (error as { name?: string }).name === "ApiError",
  );
}
