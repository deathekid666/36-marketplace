import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2" aria-label="36 home">
      <span className="text-3xl font-black tracking-[-0.12em] text-acid">36</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        Marketplace
      </span>
    </Link>
  );
}
