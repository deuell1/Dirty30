import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useClerk } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";

type Flow = "signIn" | "signUp";
type Stage = "phone" | "code";

function clerkMessage(error: unknown) {
  if (typeof error === "object" && error && "errors" in error && Array.isArray(error.errors)) {
    const message = error.errors[0]?.longMessage ?? error.errors[0]?.message;
    if (typeof message === "string") return message;
  }
  return "We could not verify that code. Check it and try again.";
}

function normalizePhone(value: string) {
  const phone = parsePhoneNumberFromString(value.trim(), "US");
  if (!phone?.isValid() || phone.country !== "US") throw new Error("Enter a valid United States mobile number.");
  return phone.number;
}

export function PhoneAuthScreen() {
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { setActive } = useClerk();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [canonicalPhone, setCanonicalPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const heading = flow === "signIn" ? "Get in the room." : "Join the league.";
  const ready = signInLoaded && signUpLoaded;
  const codeLabel = useMemo(() => canonicalPhone || "your phone", [canonicalPhone]);

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || !signIn || !signUp) return;
    setPending(true);
    setError(undefined);
    try {
      const normalizedPhone = normalizePhone(phone);
      if (flow === "signIn") {
        const attempt = await signIn.create({ identifier: normalizedPhone });
        const factor = attempt.supportedFirstFactors?.find((candidate) => candidate.strategy === "phone_code");
        if (!factor || !("phoneNumberId" in factor)) {
          throw new Error("Phone sign-in is not enabled for this league. Ask the commissioner to enable Clerk phone/SMS authentication.");
        }
        await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
      } else {
        await signUp.create({ phoneNumber: normalizedPhone });
        await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      }
      setCanonicalPhone(normalizedPhone);
      setStage("code");
      setCooldown(30);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : clerkMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !signIn || !signUp || code.trim().length < 4) return;
    setPending(true);
    setError(undefined);
    try {
      const attempt = flow === "signIn"
        ? await signIn.attemptFirstFactor({ strategy: "phone_code", code: code.trim() })
        : await signUp.attemptPhoneNumberVerification({ code: code.trim() });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        throw new Error("Phone verification needs more information. Complete any required Clerk profile fields, then try again.");
      }
      await setActive({ session: attempt.createdSessionId });
    } catch (caught) {
      setError(clerkMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return <div className="noise flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--sidebar))] p-5 text-[hsl(var(--sidebar-foreground))]">
    <div className="grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-[0_24px_80px_hsl(var(--sidebar)/.45)] md:grid-cols-[.9fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] md:block">
        <p className="font-display text-2xl font-extrabold tracking-[-.05em]">DIRTY-30</p>
        <div className="absolute -bottom-12 -left-12 h-52 w-52 rounded-full border-[26px] border-[hsl(var(--accent)/.24)]" />
        <div className="relative mt-32"><p className="font-mono-custom text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Your game-day home base</p><h1 className="mt-4 font-display text-6xl font-extrabold leading-[.88] tracking-[-.07em]">Keep<br />it<br /><span className="text-[hsl(var(--accent))]">moving.</span></h1><p className="mt-6 max-w-[220px] text-sm leading-6 text-[hsl(var(--primary-foreground)/.7)]">Schedules, scores, and the league’s version of the truth.</p></div>
      </div>
      <div className="p-7 sm:p-12">
        <div className="mb-10"><p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Verified phone access</p><h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-.06em]">{heading}</h1><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Use your United States mobile number. We’ll ask Clerk to send a one-time SMS code.</p></div>
        {stage === "phone" ? <form onSubmit={requestCode} className="space-y-5">
          <label className="block text-sm font-bold">Mobile number<input data-testid="input-auth-phone" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(312) 555-0123" className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 outline-none focus:border-[hsl(var(--primary))]" /></label>
          {error && <p data-testid="text-auth-error" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}
          <button data-testid="button-send-phone-code" type="submit" disabled={!phone.trim() || pending || !ready} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{pending ? "Requesting code…" : <>Continue with SMS <ArrowRight className="h-4 w-4" /></>}</button>
          <button data-testid="button-toggle-auth-flow" type="button" onClick={() => { setFlow((current) => current === "signIn" ? "signUp" : "signIn"); setError(undefined); }} className="w-full text-center text-sm font-bold text-[hsl(var(--primary))] hover:underline">{flow === "signIn" ? "New to Dirty-30? Join with your phone" : "Already have an account? Sign in"}</button>
        </form> : <form onSubmit={verifyCode} className="space-y-5">
          <div className="rounded-2xl bg-[hsl(var(--muted)/.65)] p-4"><p className="text-sm font-bold">Code sent to {codeLabel}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Enter the SMS code from Clerk. It expires quickly for your security.</p></div>
          <label className="block text-sm font-bold">One-time code<input data-testid="input-auth-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 font-mono-custom text-xl tracking-[.35em] outline-none focus:border-[hsl(var(--primary))]" /></label>
          {error && <p data-testid="text-auth-error" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}
          <button data-testid="button-verify-phone-code" type="submit" disabled={code.length < 4 || pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{pending ? "Checking code…" : <><ShieldCheck className="h-4 w-4" /> Verify & enter</>}</button>
          <div className="flex items-center justify-between gap-3"><button data-testid="button-back-to-phone" type="button" onClick={() => { setStage("phone"); setCode(""); setError(undefined); }} className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--muted-foreground))]"><ArrowLeft className="h-3.5 w-3.5" /> Change number</button><button data-testid="button-resend-phone-code" type="button" disabled={cooldown > 0 || pending} onClick={() => void requestCode()} className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--primary))] disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> {cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button></div>
        </form>}
        <p className="mt-8 text-center text-xs text-[hsl(var(--muted-foreground))]">Dirty-30 uses Clerk SMS verification. No password or email sign-in is available.</p>
      </div>
    </div>
  </div>;
}