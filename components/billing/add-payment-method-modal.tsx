"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconCreditCard, IconLock, IconAlertCircle } from "@tabler/icons-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ─── Inner form — rendered inside the Elements provider ──────────────────────

function CardForm({
  organizationId,
  clientSecret,
  onSuccess,
  onCancel,
}: {
  organizationId: Id<"organizations">;
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const setDefault = useAction(api.stripe.setDefaultPaymentMethod);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardNumberReady, setCardNumberReady] = useState(false);
  const [cardExpiryReady, setCardExpiryReady] = useState(false);
  const [cardCvcReady, setCardCvcReady] = useState(false);
  const allReady = cardNumberReady && cardExpiryReady && cardCvcReady;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) {
      setError("Card form not ready. Please try again.");
      setLoading(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
      clientSecret,
      { payment_method: { card: cardNumber } }
    );

    if (confirmError) {
      setError(confirmError.message ?? "Failed to save card.");
      setLoading(false);
      return;
    }

    if (setupIntent?.status === "succeeded") {
      const pmId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : (setupIntent.payment_method as any)?.id ?? null;

      if (pmId) {
        try {
          await setDefault({ organizationId, paymentMethodId: pmId });
        } catch {
          // Non-fatal — card is saved, just not set as default
        }
      }
      onSuccess();
    } else {
      setError("Unexpected result. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Card number */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium">Card number</Label>
        <div className="relative">
          <div className="flex items-center rounded-lg border bg-background px-3 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all">
            <IconCreditCard className="size-4 text-muted-foreground mr-2 shrink-0" />
            <div className="flex-1 h-5">
              <CardNumberElement
                options={{
                  style: { base: { fontSize: "14px", color: "var(--foreground)", "::placeholder": { color: "var(--muted-foreground)" } } },
                  showIcon: true,
                }}
                onReady={() => setCardNumberReady(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">Expiry date</Label>
          <div className="rounded-lg border bg-background px-3 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all">
            <div className="h-5">
              <CardExpiryElement
                options={{
                  style: { base: { fontSize: "14px", color: "var(--foreground)", "::placeholder": { color: "var(--muted-foreground)" } } },
                }}
                onReady={() => setCardExpiryReady(true)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">CVC</Label>
          <div className="rounded-lg border bg-background px-3 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all">
            <div className="h-5">
              <CardCvcElement
                options={{
                  style: { base: { fontSize: "14px", color: "var(--foreground)", "::placeholder": { color: "var(--muted-foreground)" } } },
                }}
                onReady={() => setCardCvcReady(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
          <IconAlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || !allReady || loading}
        >
          {loading ? "Saving…" : "Save card"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>

      {/* Security note */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <IconLock className="size-3" />
        Secured by Stripe. Card details are never stored on our servers.
      </p>
    </form>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────

export function AddPaymentMethodModal({
  organizationId,
  open,
  onOpenChange,
  onSuccess,
}: {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const createSetupIntent = useAction(api.stripe.createSetupIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState(false);

  useEffect(() => {
    if (!open) { setClientSecret(null); setIntentError(false); return; }
    createSetupIntent({ organizationId })
      .then(({ clientSecret }) => setClientSecret(clientSecret))
      .catch(() => setIntentError(true));
  }, [open, organizationId, createSetupIntent]);

  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess();
  };

  const appearance = {
    theme: resolvedTheme === "dark" ? ("night" as const) : ("stripe" as const),
    variables: { borderRadius: "8px" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconCreditCard className="size-4" />
            Add payment method
          </DialogTitle>
          <DialogDescription>
            This card will be saved for auto-recharge and future credit top-ups.
          </DialogDescription>
        </DialogHeader>

        {intentError ? (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-3">
            <IconAlertCircle className="size-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Failed to initialise payment form. Please try again.
            </p>
          </div>
        ) : !clientSecret ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
            </div>
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance }}
          >
            <CardForm
              organizationId={organizationId}
              clientSecret={clientSecret}
              onSuccess={handleSuccess}
              onCancel={() => onOpenChange(false)}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
