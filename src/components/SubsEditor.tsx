import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateSubscriberCount } from "@/lib/profile.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/components/Primitives";

export function SubsEditor({
  subs,
  variant = "pill",
}: {
  subs: number | null | undefined;
  variant?: "pill" | "link";
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSubscriberCount);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(String(subs ?? 0));

  useEffect(() => {
    if (open) setValue(String(subs ?? 0));
  }, [open, subs]);

  const mut = useMutation({
    mutationFn: (n: number) => updateFn({ data: { subscriber_count: n } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.removeQueries({ queryKey: ["discover-results"] });
      toast.success("Updated — competitor tier refreshed");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  const onSave = () => {
    const n = Math.max(0, Math.min(100_000_000, Math.floor(Number(value) || 0)));
    mut.mutate(n);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "pill" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full text-xs font-medium"
            aria-label="Edit subscriber count"
          >
            <Users className="w-3.5 h-3.5" />
            {formatNumber(subs ?? 0)} subs
            <Pencil className="w-3 h-3 opacity-60" />
          </Button>
        ) : (
          <button className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Update subs
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-sm">Your subscriber count</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We re-tier your peer benchmarks as you grow.
            </p>
          </div>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100_000_000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
