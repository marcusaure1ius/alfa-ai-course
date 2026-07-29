import {
  InfrastructureView,
  type InfrastructureViewState,
} from "@/components/infrastructure/infrastructure-view";

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const requested = (await searchParams).demo;
  const state: InfrastructureViewState =
    process.env.VERCEL_ENV !== "production" &&
    (requested === "list" || requested === "error")
      ? requested
      : "empty";

  return <InfrastructureView state={state} />;
}
