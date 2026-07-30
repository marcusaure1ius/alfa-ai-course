import { cn } from "@/lib/utils";

type NeurokursBrandProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

export function NeurokursBrand({
  compact = false,
  inverse = false,
  className,
}: NeurokursBrandProps) {
  if (compact) {
    return (
      <span
        aria-label="neurokurs"
        className={cn(
          "font-display flex size-8 items-center justify-center rounded-md text-sm",
          inverse
            ? "bg-white text-black"
            : "bg-primary text-primary-foreground",
          className,
        )}
      >
        n
      </span>
    );
  }

  return (
    <span
      aria-label="neurokurs"
      className={cn(
        "font-display text-[1.1rem] leading-none tracking-[-0.045em]",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
    >
      neurokurs
    </span>
  );
}
