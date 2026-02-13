"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Phone,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { isApiError, useAuth } from "@/src/components/auth/auth-provider";
import { AppShell } from "@/src/components/layout/app-shell";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { DEFAULT_PHONE_COUNTRY } from "@/src/lib/env";
import { formatPhoneE164, toErrorMessage } from "@/src/lib/utils";

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;
const BLOCK_SECONDS = 15 * 60;
const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

const STEPS = [
  { key: "phone", label: "Número" },
  { key: "code", label: "Código" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { prepareRecaptcha, sendOtp, verifyOtpCode } = useAuth();

  const [redirect, setRedirect] = useState("/");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [remainingCooldown, setRemainingCooldown] = useState(0);
  const [remainingBlock, setRemainingBlock] = useState(0);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (remainingCooldown <= 0 && remainingBlock <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setRemainingCooldown((current) => Math.max(0, current - 1));
      setRemainingBlock((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingCooldown, remainingBlock]);

  const blocked = remainingBlock > 0;
  const normalizedPhone = useMemo(() => formatPhoneE164(phone), [phone]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirect(params.get("redirect") ?? "/");
  }, []);

  useEffect(() => {
    void prepareRecaptcha({ recaptchaContainerId: RECAPTCHA_CONTAINER_ID });
  }, [prepareRecaptcha]);

  async function onSendOtp() {
    if (!normalizedPhone) {
      setError("Ingresa un número válido.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      await sendOtp(normalizedPhone, { recaptchaContainerId: RECAPTCHA_CONTAINER_ID });
      setStep("code");
      setRemainingCooldown(COOLDOWN_SECONDS);
      setSuccess("Código enviado por SMS.");
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  async function onVerifyCode() {
    if (blocked) {
      setError(`Demasiados intentos. Intenta en ${remainingBlock} segundos.`);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      const user = await verifyOtpCode(normalizedPhone, code.trim());
      setSuccess("Sesión iniciada.");

      if (!user.alias) {
        router.replace(`/perfil?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      router.replace(redirect);
    } catch (nextError) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setRemainingBlock(BLOCK_SECONDS);
      }
      if (isApiError(nextError)) {
        if (nextError.code === "OTP_EXPIRED") {
          setError("Código expirado. Solicita uno nuevo.");
          return;
        }
        if (nextError.code === "OTP_INVALID") {
          setError("Código incorrecto.");
          return;
        }
      }
      setError(toErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  const currentStepIndex = step === "phone" ? 0 : 1;

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
          <CardDescription>
            Accede con tu número para crear partidos o unirte desde links de WhatsApp.
          </CardDescription>

          {/* Step indicator */}
          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, index) => (
              <div key={s.key} className="flex items-center gap-2">
                {index > 0 ? (
                  <div className={`h-px w-6 ${index <= currentStepIndex ? "bg-emerald-400" : "bg-zinc-200"}`} />
                ) : null}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      index <= currentStepIndex
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      index <= currentStepIndex ? "text-zinc-700" : "text-zinc-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={RECAPTCHA_CONTAINER_ID}>Verificación anti-bot</Label>
            <div
              id={RECAPTCHA_CONTAINER_ID}
              className="min-h-[78px] rounded-md border border-zinc-200 bg-zinc-50 p-1"
            />
          </div>

          {/* Phone input */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-zinc-400" />
              Número de teléfono ({DEFAULT_PHONE_COUNTRY})
            </Label>
            <div className="flex gap-2">
              <div className="flex min-h-[44px] items-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-500">
                +57
              </div>
              <Input
                id="phone"
                className="flex-1"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="300 123 4567"
                inputMode="tel"
                disabled={step === "code"}
                data-testid="phone-input"
              />
            </div>
          </div>

          {/* OTP input */}
          {step === "code" ? (
            <div className="space-y-2">
              <Label htmlFor="code" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                Código OTP
              </Label>
              <Input
                id="code"
                className="text-center text-lg font-semibold tracking-[0.3em]"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="------"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                data-testid="otp-input"
              />
            </div>
          ) : null}

          {/* Blocked warning */}
          {blocked ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Demasiados intentos. Intenta en {remainingBlock} segundos.</span>
            </div>
          ) : null}

          {/* Error feedback */}
          {error && !blocked ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Success feedback */}
          {success ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          {/* Actions */}
          <div className="space-y-2.5">
            {step === "phone" ? (
              <Button className="w-full" size="lg" onClick={onSendOtp} disabled={isLoading || blocked} data-testid="send-otp-btn">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isLoading ? "Enviando..." : "Enviar código"}
              </Button>
            ) : (
              <>
                <Button className="w-full" size="lg" onClick={onVerifyCode} disabled={isLoading || blocked} data-testid="verify-otp-btn">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {isLoading ? "Verificando..." : "Verificar código"}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={remainingCooldown > 0 || isLoading}
                  onClick={onSendOtp}
                  type="button"
                >
                  {remainingCooldown > 0 ? (
                    <>
                      Reenviar en{" "}
                      <Badge variant="neutral" className="ml-1">{remainingCooldown}s</Badge>
                    </>
                  ) : (
                    "Reenviar código"
                  )}
                </Button>
              </>
            )}
            <Button className="w-full" variant="ghost" asChild>
              <Link href={redirect}>Cancelar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
