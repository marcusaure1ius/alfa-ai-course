import { redirect } from "next/navigation";

export default async function LegacyEnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/tools/n8n/instances/${id}`);
}
