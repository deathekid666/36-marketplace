import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/commerce";
import { db } from "@/lib/db";

export const metadata = { title: "Referrals" };

export default async function Page() {
  const user = await requireRole("CREATOR");
  const referrals = await db.referral.findMany({
    where: { inviterId: user.id },
    include: {
      invitee: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const qualified = referrals.filter((referral) =>
    ["QUALIFIED", "REWARDED"].includes(referral.status),
  ).length;

  const rewardTotals = new Map<string, number>();
  for (const referral of referrals) {
    if (referral.status !== "REWARDED") continue;
    rewardTotals.set(
      referral.currency,
      (rewardTotals.get(referral.currency) || 0) + referral.rewardMad,
    );
  }
  const rewards = [...rewardTotals.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-5xl px-5 py-10">
        <span className="text-xs font-bold uppercase tracking-[.16em] text-acid">
          36 Referral
        </span>
        <h1 className="mt-3 text-4xl font-black">Invite creators</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Your referral becomes qualified after the invited creator completes a
          paid studio booking.
        </p>

        <div className="mt-7 rounded-2xl border border-acid/20 bg-acid/[.04] p-6">
          <span className="label">Your code</span>
          <div className="mt-2 text-3xl font-black text-acid">
            {user.referralCode || "—"}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Share this code during signup. Rewards are released according to the
            active 36 referral campaign.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="panel">
            <span className="label">Invited</span>
            <b className="text-3xl">{referrals.length}</b>
          </div>
          <div className="panel">
            <span className="label">Qualified</span>
            <b className="text-3xl text-acid">{qualified}</b>
          </div>
          <div className="panel">
            <span className="label">Reward value</span>
            <div className="mt-2 space-y-1">
              {rewards.length ? (
                rewards.map(([currency, amount]) => (
                  <b key={currency} className="block text-xl">
                    {formatMoney(amount, currency)}
                  </b>
                ))
              ) : (
                <b className="block text-2xl text-zinc-600">—</b>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {referrals.map((referral) => (
            <article
              key={referral.id}
              className="panel flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <b>{referral.invitee.name}</b>
                <span className="mt-1 block text-xs text-zinc-600">
                  {referral.invitee.email}
                </span>
                {referral.rewardMad > 0 && (
                  <span className="mt-1 block text-[10px] text-zinc-600">
                    Campaign reward:{" "}
                    {formatMoney(referral.rewardMad, referral.currency)}
                  </span>
                )}
              </div>
              <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                {referral.status}
              </span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
