import type { StudioStatus } from "@prisma/client";
import { studioStatusLabel } from "@/lib/studio";

const styles: Record<StudioStatus, string> = {
  DRAFT: "border-[#cfcfcf] text-[#555555]",
  SUBMITTED: "border-amber-700/60 bg-amber-500/5 text-amber-600",
  VERIFIED: "border-acid/50 bg-acid/[0.06] text-acid",
  REJECTED: "border-red-900/70 bg-red-500/5 text-red-300",
  SUSPENDED: "border-red-900 bg-red-950/40 text-red-300",
};

export function StudioStatusBadge({ status }: { status: StudioStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${styles[status]}`}>
      {studioStatusLabel(status)}
    </span>
  );
}
