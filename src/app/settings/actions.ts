"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { confirmActivationEvent, setSignupPagePath, setBrandedQueryTerms, setTwitterHandle, setDiscordGuildId } from "@/lib/settings";
import { TRIGGER_CONFIG_DEFAULTS } from "@/lib/triggers/evaluate";

const CONFIG_KEYS = Object.keys(TRIGGER_CONFIG_DEFAULTS);

export async function updateTriggerConfig(formData: FormData) {
  for (const key of CONFIG_KEYS) {
    const raw = formData.get(key);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (Number.isNaN(value)) continue;
    await prisma.triggerConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  revalidatePath("/settings");
}

/// FR-6a: requires the explicit "confirm" checkbox — there's no plain edit
/// field, matching the source doc's "define once, do not change it." Reports
/// its result via a redirect + query param rather than a client hook — this
/// project pins React 18.3.1 (matching the companion app), which doesn't
/// export useActionState/useFormState.
export async function confirmActivationEventAction(formData: FormData) {
  const eventName = String(formData.get("activationEventName") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!eventName) {
    redirect("/settings?activationStatus=error&activationMessage=" + encodeURIComponent("Enter an event name first."));
  }
  if (!confirmed) {
    redirect(
      "/settings?activationStatus=error&activationMessage=" +
        encodeURIComponent("Check the confirmation box — this is a deliberate, rare change.")
    );
  }
  await confirmActivationEvent(eventName);
  revalidatePath("/settings");
  redirect(
    "/settings?activationStatus=success&activationMessage=" + encodeURIComponent(`Activation event locked to "${eventName}".`)
  );
}

export async function updateSignupPagePathAction(formData: FormData) {
  const pagePath = String(formData.get("signupPagePath") ?? "").trim();
  if (!pagePath) return;
  await setSignupPagePath(pagePath);
  revalidatePath("/settings");
}

export async function updateBrandedQueryTermsAction(formData: FormData) {
  const raw = String(formData.get("brandedQueryTerms") ?? "");
  const terms = raw
    .split(/[\n,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  await setBrandedQueryTerms(terms);
  revalidatePath("/settings");
}

export async function updateTwitterHandleAction(formData: FormData) {
  const handle = String(formData.get("twitterHandle") ?? "").trim().replace(/^@/, "");
  if (!handle) return;
  await setTwitterHandle(handle);
  revalidatePath("/settings");
}

export async function updateDiscordGuildIdAction(formData: FormData) {
  const guildId = String(formData.get("discordGuildId") ?? "").trim();
  if (!guildId) return;
  await setDiscordGuildId(guildId);
  revalidatePath("/settings");
}
