import {
  InfrastructureView,
  type InfrastructureViewState,
} from "@/components/infrastructure/infrastructure-view";
import { InfrastructureControl } from "@/components/infrastructure/infrastructure-control";

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; control?: string }>;
}) {
  const params = await searchParams;
  const requested = params.demo;
  if (
    (process.env.VERCEL_ENV === "production" &&
      process.env.PLATFORM_PROVIDER === "timeweb") ||
    (process.env.VERCEL_ENV !== "production" && params.control === "1")
  ) {
    return <InfrastructureControl />;
  }
  const state: InfrastructureViewState =
    process.env.VERCEL_ENV !== "production" &&
    (requested === "list" || requested === "error")
      ? requested
      : "empty";

  return <InfrastructureView state={state} />;
}
