"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "Verify your email",
    description: "Confirm your address before creating protected assets or API keys.",
    href: "/dashboard/account",
  },
  {
    title: "Add your first site",
    description: "Register the domain where your protected player will run.",
    href: "/dashboard/sites",
  },
  {
    title: "Create an API key",
    description: "Connect your application without exposing dashboard credentials.",
    href: "/dashboard/api-keys",
  },
];

export default function OnboardingPage() {
  const auth = useAuth();
  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <p className="eyebrow">GET STARTED</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Protect your first experience
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Your workspace is ready. Complete these steps to issue secure playback sessions.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => {
          const complete = index === 0 && auth?.account?.emailVerified;
          return (
            <Card key={step.title} className="overflow-hidden border-border/70 bg-card/80">
              <CardHeader>
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {index === 0 ? (
                      <ShieldCheck size={19} />
                    ) : index === 1 ? (
                      <Circle size={19} />
                    ) : (
                      <KeyRound size={19} />
                    )}
                  </span>
                  <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <CardTitle className="flex items-center gap-2">
                  {step.title}
                  {complete && <Check className="text-emerald-500" size={18} />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="min-h-12 text-sm leading-6 text-muted-foreground">
                  {step.description}
                </p>
                <Button asChild variant={complete ? "outline" : "default"} className="mt-6 w-full">
                  <Link href={step.href}>
                    {complete ? "Review" : "Continue"}
                    <ArrowRight size={15} />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Button asChild variant="ghost">
        <Link href="/dashboard">Skip to dashboard</Link>
      </Button>
    </div>
  );
}
