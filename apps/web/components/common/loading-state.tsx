export function LoadingState({ label = "Загрузка..." }: { label?: string }) {
  return <div className="text-sm text-muted-foreground">{label}</div>;
}
