import { confirmActivationEventAction } from "./actions";

export function ActivationEventForm({
  current,
  lockedAt,
  feedback,
}: {
  current: string | null;
  lockedAt: string | null;
  feedback: { status: "success" | "error"; message: string } | null;
}) {
  return (
    <form action={confirmActivationEventAction} className="flex flex-col gap-2">
      <label className="text-tremor-default font-medium text-tremor-content-emphasis">
        Activation Event (PostHog event name)
      </label>
      <input
        type="text"
        name="activationEventName"
        defaultValue={current ?? ""}
        placeholder='e.g. "connected a database"'
        className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
      />
      {current && lockedAt && (
        <p className="text-tremor-default text-tremor-content">
          Currently locked to <strong>{current}</strong> since {lockedAt}. Changing this rewrites what every past
          week&apos;s Activation Rate compared against going forward — the source doc&apos;s own rule is &ldquo;define
          once, do not change it,&rdquo; so this requires an explicit confirmation, not a plain edit.
        </p>
      )}
      <label className="flex items-center gap-2 text-tremor-default">
        <input type="checkbox" name="confirm" />I understand this should rarely change and confirm the value above.
      </label>
      <button
        type="submit"
        className="w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis"
      >
        Lock / Update Activation Event
      </button>
      {feedback && (
        <p className={feedback.status === "success" ? "text-emerald-600 text-tremor-default" : "text-red-600 text-tremor-default"}>
          {feedback.message}
        </p>
      )}
    </form>
  );
}
