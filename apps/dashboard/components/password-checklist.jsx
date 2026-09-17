"use client";

import { CheckCircle2, Circle } from "lucide-react";

export const passwordRules = [
  { key: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { key: "lower", label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { key: "upper", label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { key: "number", label: "One number", test: (value) => /[0-9]/.test(value) },
];

export function passwordIsValid(value) {
  return passwordRules.every((rule) => rule.test(value));
}

export function PasswordChecklist({ value }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-live="polite">
      {passwordRules.map((rule) => {
        const met = rule.test(value);
        const Icon = met ? CheckCircle2 : Circle;
        return (
          <div
            key={rule.key}
            className={`flex items-center gap-2 text-xs ${met ? "text-emerald-700" : "text-[#777d73]"}`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{rule.label}</span>
          </div>
        );
      })}
    </div>
  );
}
