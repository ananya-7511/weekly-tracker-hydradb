"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ingestMentionsFromCsvText } from "@/lib/mentions/ingestMentions";

/// Reports its result via a redirect + query param rather than a client hook
/// (useActionState/useFormState) — this project pins React 18.3.1 (matching
/// the companion app), which doesn't export either.
export async function uploadMentionsCsv(formData: FormData) {
  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/mentions/upload?status=error&message=" + encodeURIComponent("Choose a CSV file first."));
  }

  const text = await file.text();
  const result = await ingestMentionsFromCsvText(text);
  revalidatePath("/trends");
  revalidatePath("/");

  if (result.errors.length > 0) {
    const preview = result.errors
      .slice(0, 5)
      .map((e) => `Row ${e.rowNumber}: ${e.reason}`)
      .join("; ");
    const message = `Ingested ${result.rowsIngested} row(s), skipped ${result.errors.length} with errors — ${preview}${
      result.errors.length > 5 ? "…" : ""
    }`;
    redirect(
      `/mentions/upload?status=${result.rowsIngested > 0 ? "success" : "error"}&message=${encodeURIComponent(message)}`
    );
  }

  redirect(`/mentions/upload?status=success&message=${encodeURIComponent(`Ingested ${result.rowsIngested} row(s) successfully.`)}`);
}
