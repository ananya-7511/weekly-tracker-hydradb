import { prisma } from "@/lib/prisma";

const DEFAULT_SIGNUP_PAGE_PATH = "/sign-up";

export async function getAppSettings() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return {
    signupPagePath: settings?.signupPagePath ?? DEFAULT_SIGNUP_PAGE_PATH,
    activationEventName: settings?.activationEventName ?? null,
    activationEventLockedAt: settings?.activationEventLockedAt ?? null,
    brandedQueryTerms: settings?.brandedQueryTerms ?? [],
  };
}

/// FR-6a: the activation event is stored once and requires an explicit confirmation
/// to change — this is the only write path, there's no plain "edit" field for it.
/// Dormant for now (Outcome-layer Activation Rate was removed, revisit later).
export async function confirmActivationEvent(eventName: string) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", activationEventName: eventName, activationEventLockedAt: new Date() },
    update: { activationEventName: eventName, activationEventLockedAt: new Date() },
  });
}

export async function setSignupPagePath(pagePath: string) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", signupPagePath: pagePath },
    update: { signupPagePath: pagePath },
  });
}

export async function setBrandedQueryTerms(terms: string[]) {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", brandedQueryTerms: terms },
    update: { brandedQueryTerms: terms },
  });
}
