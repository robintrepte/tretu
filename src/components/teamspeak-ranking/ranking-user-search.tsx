import { Input } from "@/components/ui/input";

export function RankingUserSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="search"
      placeholder="Nickname suchen…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-xs"
      aria-label="Nickname suchen"
    />
  );
}
