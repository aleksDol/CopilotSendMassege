import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export function MetricCard({
  title,
  value,
  hint,
  deltaLabel,
  deltaDirection,
  comparisonText
}: {
  title: string;
  value: number | string;
  hint?: string;
  deltaLabel?: string;
  deltaDirection?: "positive" | "negative" | "neutral";
  comparisonText?: string;
}) {
  const deltaClass =
    deltaDirection === "positive"
      ? "text-emerald-500"
      : deltaDirection === "negative"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint || deltaLabel ? (
        <CardContent className="pt-0">
          {deltaLabel ? (
            <div className={cn("text-xs font-medium", deltaClass)}>
              {deltaLabel}
              {comparisonText ? <span className="ml-1 font-normal text-muted-foreground">{comparisonText}</span> : null}
            </div>
          ) : null}
          {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
