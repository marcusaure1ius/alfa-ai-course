import { requireAdmin } from "@/server/auth/access";
import { getTimewebProvisioningPreview } from "@/server/providers/timeweb/provisioning";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const region = url.searchParams.get("region") ?? undefined;
  const presetId = url.searchParams.get("presetId");
  const operatingSystemId = url.searchParams.get("operatingSystemId");
  const backupsEnabled = url.searchParams.get("backupsEnabled");
  const hasSelection =
    region !== undefined ||
    presetId !== null ||
    operatingSystemId !== null ||
    backupsEnabled !== null;
  const parsedPresetId = presetId === null ? undefined : Number(presetId);
  const parsedOperatingSystemId =
    operatingSystemId === null ? undefined : Number(operatingSystemId);
  if (
    (presetId !== null &&
      (!Number.isSafeInteger(parsedPresetId) || parsedPresetId! <= 0)) ||
    (operatingSystemId !== null &&
      (!Number.isSafeInteger(parsedOperatingSystemId) ||
        parsedOperatingSystemId! <= 0)) ||
    (backupsEnabled !== null &&
      backupsEnabled !== "true" &&
      backupsEnabled !== "false")
  ) {
    return Response.json(
      {
        ok: false,
        code: "INVALID_SELECTION",
        message: "Параметры конфигурации имеют неверный формат.",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const preview = await getTimewebProvisioningPreview(process.env, fetch, {
    ...(hasSelection
      ? {
          selection: {
            ...(region ? { region } : {}),
            ...(parsedPresetId ? { presetId: parsedPresetId } : {}),
            ...(parsedOperatingSystemId
              ? { operatingSystemId: parsedOperatingSystemId }
              : {}),
            ...(backupsEnabled !== null
              ? { backupsEnabled: backupsEnabled === "true" }
              : {}),
          },
        }
      : {}),
  });
  return Response.json(preview, {
    status: preview.ok ? 200 : 424,
    headers: { "cache-control": "no-store" },
  });
}
