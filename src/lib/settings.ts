import { prisma } from "@/lib/prisma";

const DEFAULT_SIGNUP_EVENT = "user signed up";

export async function getAppSettings() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return {
    signupEventName: settings?.signupEventName ?? DEFAULT_SIGNUP_EVENT,
    activationEventName: settings?.activationEventName ?? null,
    activationEventLockedAt: settings?.activationEventLockedAt ?? null,
    brandedQueryTerms: settings?.brandedQueryTerms ?? [],
  };
}

/// FR-6a: the activation event is stored once and requires an explicit confirmation
/// to change — this is the only write path, there's no plain "edit" field for it.
export async function confirmActivationEvent(eventName: string) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", activationEventName: eventName, activationEventLockedAt: new Date() },
    update: { activationEventName: eventName, activationEventLockedAt: new Date() },
  });
}

export async function setSignupEventName(eventName: string) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", signupEventName: eventName },
    update: { signupEventName: eventName },
  });
}

export async function setBrandedQueryTerms(terms: string[]) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", brandedQueryTerms: terms },
    update: { brandedQueryTerms: terms },
  });
}
