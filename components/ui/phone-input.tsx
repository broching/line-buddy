"use client";

import * as React from "react";
import PhoneInputPrimitive, { type Country, type Value } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

// Text field that matches the shadcn Input look, but forwards a ref (required by
// react-phone-number-input). The shadcn <Input> doesn't forward refs.
const PhoneTextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input"
      className={cn(
        "border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
      {...props}
    />
  )
);
PhoneTextInput.displayName = "PhoneTextInput";

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "SG" as Country,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: Country;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <PhoneInputPrimitive
      international
      withCountryCallingCode
      defaultCountry={defaultCountry}
      value={value as Value}
      onChange={(v) => onChange((v ?? "") as string)}
      disabled={disabled}
      inputComponent={PhoneTextInput}
      className={cn("lb-phone-input flex items-center gap-2", className)}
    />
  );
}
