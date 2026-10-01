import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { BookingFileUploader } from "@/components/BookingFileUploader";
import { BookingHoldCountdown } from "@/components/BookingHoldCountdown";
import { VerifiedReviewForm } from "@/components/VerifiedReviewForm";
import { openDisputeAction } from "@/app/disputes/actions";
import { cancelBookingAction, sendBookingMessageAction } from "@/app/bookings/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMarketplaceDateTime } from "@/lib/time";
import { offlinePaymentLabel } from "@/lib/offline-payment";

function stars(value: number) {
  return "★".repeat(value) + "☆".repeat(5 - value);
}

export default async function CreatorBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    cancelled?: string;
    reviewed?: string;
    error?: string;
    from?: string;
    checkout?: string;
    booked?: string;
  }>;
}) {
  const user = await requireRole("CREATOR");
  const { id } = await params;
  const query = await searchParams;
  const booking = await db.booking.findFirst({
    where: { id, creatorId: user.id },
    include: {
      studio: true,
      room: true,
      payments: { orderBy: { createdAt: "desc" } },
      conversation: { include: { messages: { include: { sender: true }, orderBy: { createdAt: "asc" } } } },
      review: true,
      dispute: true,
      flashSlot: true,
      addons: true,
      storedFiles: true,
    },
  });
  if (!booking) notFound();

  const deposit = booking.payments.find((p) => p.kind === "DEPOSIT");
  const balance = booking.payments.find((p) => p.kind === "BALANCE");
  const refund = booking.payments.find((p) => p.kind === "REFUND");
  const canCancel = ["PENDING_DEPOSIT", "CONFIRMED"].includes(booking.status) && booking.startAt > new Date();
  const pendingDeposit = booking.status === "PENDING_DEPOSIT" && (!booking.expiresAt || booking.expiresAt > new Date());
  const offlinePayment = booking.payments.find((payment) =>
    offlinePaymentLabel(payment.provider),
  );
  const offlinePaymentMethod = offlinePaymentLabel(
    offlinePayment?.provider,
  );

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/creator/bookings" className="text-xs font-bold text-zinc-500 hover:text-white">← Your bookings</Link>
        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-acid">{booking.status.replaceAll("_", " ")}</span>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.045em]">{booking.studio.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">{booking.room.name} · {formatMarketplaceDateTime(booking.startAt)} → {formatMarketplaceDateTime(booking.endAt)}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-700">
              36-{booking.id.replaceAll("-", "").slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div className="text-right">
            <b className="text-3xl">{booking.totalAmountMad} MAD</b>
            {booking.baseAmountMad > booking.totalAmountMad && <span className="ml-2 text-sm text-zinc-600 line-through">{booking.baseAmountMad} MAD</span>}
            <span className="block text-xs text-zinc-600">total</span>
          </div>
        </div>

        {!["CANCELLED", "EXPIRED"].includes(booking.status) && (
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={"/api/bookings/" + booking.id + "/calendar"}
              className="button-dark"
            >
              Add to calendar
            </a>
            <Link
              href={"/studios/" + booking.studio.slug}
              className="button-dark"
            >
              Studio profile
            </Link>
          </div>
        )}

        {query.booked === "1" && offlinePaymentMethod && (
          <div className="mt-6 rounded-2xl border border-emerald-800/40 bg-emerald-950/15 p-5">
            <b className="text-sm text-emerald-300">Booking confirmed — no online payment required</b>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Payment method: {offlinePaymentMethod}. Pay the studio directly. The studio will mark the payment received in 36.
            </p>
          </div>
        )}
        {query.checkout === "1" && pendingDeposit && (
          <div className="mt-6 rounded-2xl border border-amber-800/45 bg-amber-950/15 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <b className="text-sm text-amber-200">Your studio slot is temporarily held</b>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Complete the deposit before the timer reaches zero to confirm the booking.
                </p>
              </div>
              {booking.expiresAt && (
                <div className="rounded-full border border-amber-800/40 bg-black/20 px-4 py-2 text-sm">
                  <BookingHoldCountdown expiresAt={booking.expiresAt.toISOString()} />
                </div>
              )}
            </div>
          </div>
        )}
        {(query.cancelled || query.reviewed) && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">{query.cancelled ? "Booking cancelled. Refund status is shown below." : "Review submitted. Thank you."}</div>}
        {query.error && <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">That action could not be completed.</div>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section className="panel">
              <h2 className="text-xl font-black">Booking & payment</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-black/30 p-4"><span className="label">{offlinePaymentMethod ? "Payment method" : "Deposit"}</span><b>{offlinePaymentMethod ? offlinePaymentMethod : booking.depositAmountMad + " MAD · " + (deposit?.status || (booking.depositAmountMad === 0 ? "NOT REQUIRED" : booking.paymentStatus))}</b></div>
                <div className="rounded-xl bg-black/30 p-4"><span className="label">Balance</span><b>{balance ? `${balance.amountMad} MAD · ${balance.status}` : "0 MAD"}</b></div>
                <div className="rounded-xl bg-black/30 p-4"><span className="label">Payment status</span><b>{booking.paymentStatus}</b></div>
                <div className="rounded-xl bg-black/30 p-4"><span className="label">Cancellation</span><b>{booking.studio.freeCancellationHours}h free-cancellation window</b></div>
              </div>
              {offlinePaymentMethod && booking.paymentStatus !== "PAID" && (
                <div className="mt-4 rounded-xl border border-emerald-900/35 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-300">Pay directly to the studio</b>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {booking.totalAmountMad} MAD · {offlinePaymentMethod}. No card processor or paid gateway is used.
                  </p>
                </div>
              )}
              {offlinePaymentMethod && booking.paymentStatus === "PAID" && (
                <div className="mt-4 rounded-xl border border-emerald-900/35 bg-emerald-950/10 p-4 text-xs font-black text-emerald-300">
                  Studio marked payment received ✓
                </div>
              )}
              {pendingDeposit && (
                <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/15 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <b className="text-sm text-amber-200">Deposit required</b>
                      <p className="mt-1 text-xs leading-5 text-amber-100/70">
                        Your slot is reserved only while this hold remains active.
                      </p>
                    </div>
                    {booking.expiresAt && (
                      <BookingHoldCountdown expiresAt={booking.expiresAt.toISOString()} />
                    )}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-amber-900/25 pt-4 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-500">Room session</span>
                      <b>{booking.baseAmountMad} MAD</b>
                    </div>
                    {booking.addons.length > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">Add-ons</span>
                        <b>
                          {booking.addons.reduce((sum, addon) => sum + addon.totalMad, 0)} MAD
                        </b>
                      </div>
                    )}
                    {booking.promoDiscountMad > 0 && (
                      <div className="flex justify-between gap-3 text-emerald-300">
                        <span>Promo discount</span>
                        <b>-{booking.promoDiscountMad} MAD</b>
                      </div>
                    )}
                    {booking.taxAmountMad > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">Tax</span>
                        <b>{booking.taxAmountMad} MAD</b>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-amber-900/25 pt-2">
                      <span className="font-black text-zinc-300">Total</span>
                      <b>{booking.totalAmountMad} MAD</b>
                    </div>
                    <div className="flex justify-between gap-3 text-amber-200">
                      <span>Deposit due now</span>
                      <b>{booking.depositAmountMad} MAD</b>
                    </div>
                  </div>

                  {deposit?.checkoutUrl ? (
                    <a
                      href={deposit.checkoutUrl}
                      rel="noreferrer"
                      className="mt-4 inline-flex w-full justify-center rounded-lg bg-acid px-4 py-3 text-xs font-black text-black"
                    >
                      Pay deposit securely
                    </a>
                  ) : (
                    <p className="mt-4 rounded-lg border border-zinc-800 bg-black/20 p-3 text-xs leading-5 text-zinc-500">
                      Online payment is not connected to an automatic merchant gateway yet.
                      The existing 36 payment workflow can attach a secure Payzone/NAPS/CMI checkout link to this deposit.
                    </p>
                  )}
                </div>
              )}
              {booking.status === "CONFIRMED" && balance?.status === "PENDING" && <div className="mt-4 rounded-xl border border-sky-800/40 bg-sky-950/15 p-4"><b className="text-sm text-sky-200">Balance due before the session is financially complete</b><p className="mt-1 text-xs leading-5 text-sky-100/70">Remaining balance: {balance.amountMad} MAD.</p>{balance.checkoutUrl ? <a href={balance.checkoutUrl} rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-acid px-4 py-2 text-xs font-black text-black">Pay remaining balance</a> : <p className="mt-3 text-xs text-zinc-500">36 Admin can attach the secure balance checkout link.</p>}</div>}
              {refund && <div className="mt-4 rounded-xl border border-zinc-800 p-4 text-xs"><span className="text-zinc-500">Refund</span><b className="ml-3">{refund.amountMad} MAD · {refund.status}</b></div>}
              {booking.addons.length > 0 && <div className="mt-4 border-t border-zinc-900 pt-4"><span className="label">Add-ons</span><div className="space-y-2">{booking.addons.map((addon)=><div key={addon.id} className="flex justify-between text-xs"><span className="text-zinc-500">{addon.nameSnapshot} ×{addon.quantity}</span><b>{addon.totalMad} MAD</b></div>)}</div></div>}
            </section>

            <section className="panel"><div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Shared workspace</span><h2 className="mt-2 text-xl font-black">Project files</h2></div><span className="text-xs text-zinc-600">{booking.storedFiles.length} files</span></div><div className="mt-4 space-y-2">{booking.storedFiles.map((f)=><a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex justify-between rounded-xl border border-zinc-900 p-3 text-xs hover:border-zinc-700"><span className="text-zinc-300">{f.mimeType}</span><span className="text-zinc-600">{Math.round(Number(f.sizeBytes)/1024)} KB ↗</span></a>)}</div><BookingFileUploader bookingId={booking.id}/></section>

            <section className="panel">
              <div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Private booking chat</span><h2 className="mt-2 text-xl font-black">Message the studio</h2></div><span className="text-xs text-zinc-600">{booking.conversation?.messages.length || 0} messages</span></div>
              <div className="mt-5 max-h-96 space-y-3 overflow-y-auto pr-1">{booking.conversation?.messages.length ? booking.conversation.messages.map((message) => <div key={message.id} className={`rounded-xl p-3 ${message.senderId === user.id ? "ml-10 bg-acid/[0.08]" : "mr-10 bg-zinc-900"}`}><div className="flex justify-between gap-3 text-[10px] text-zinc-600"><b className="text-zinc-400">{message.sender.name}</b><span>{formatMarketplaceDateTime(message.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{message.body}</p></div>) : <p className="text-sm text-zinc-600">No messages yet.</p>}</div>
              <form action={sendBookingMessageAction} className="mt-5 flex gap-2"><input type="hidden" name="bookingId" value={booking.id} /><input className="field" name="body" maxLength={2000} placeholder="Ask about access, setup, equipment…" required /><button className="rounded-xl bg-acid px-4 text-xs font-black text-black">Send</button></form>
            </section>

            {booking.status === "COMPLETED" && !booking.review && (
              <section className="panel">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                      Verified session
                    </span>
                    <h2 className="mt-2 text-xl font-black">Review this studio</h2>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    Only completed 36 bookings can review
                  </span>
                </div>
                <VerifiedReviewForm bookingId={booking.id} />
              </section>
            )}
            {booking.review && <section className="panel"><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Your verified review</span><div className="mt-3 text-lg text-acid">{stars(booking.review.rating)}</div><p className="mt-3 text-sm leading-6 text-zinc-400">{booking.review.comment || "No written comment."}</p>{booking.review.ownerReply && <div className="mt-4 rounded-xl bg-zinc-900 p-4"><b className="text-xs">Studio reply</b><p className="mt-2 text-sm text-zinc-400">{booking.review.ownerReply}</p></div>}</section>}
          </div>

          <aside className="space-y-5">
            <Link href={`/bookings/${booking.id}/invoice`} className="block rounded-2xl border border-zinc-800 p-4 text-center text-xs font-black text-zinc-300 hover:border-acid/40 hover:text-acid">View invoice</Link><section className="panel"><h2 className="text-lg font-black">Session summary</h2><dl className="mt-4 space-y-3 text-xs"><div><dt className="text-zinc-600">Room</dt><dd className="mt-1 font-bold">{booking.room.name}</dd></div><div><dt className="text-zinc-600">Status</dt><dd className="mt-1 font-bold">{booking.status}</dd></div><div><dt className="text-zinc-600">Source</dt><dd className="mt-1 font-bold">{booking.flashSlotId ? "36 NOW" : booking.notes.includes("36 Request") ? "36 Request" : "Marketplace"}</dd></div></dl></section>
            <section className="panel"><h2 className="text-lg font-black">Support & dispute</h2>{booking.dispute ? <div className="mt-3 rounded-xl border border-amber-800/40 p-4 text-xs text-amber-200">Dispute status: <b>{booking.dispute.status}</b>{booking.dispute.resolution && <p className="mt-2 text-zinc-400">{booking.dispute.resolution}</p>}</div> : <form action={openDisputeAction} className="mt-4 space-y-3"><input type="hidden" name="bookingId" value={booking.id}/><input className="field" name="reason" placeholder="Reason" required maxLength={160}/><textarea className="field" name="details" placeholder="Explain what happened" maxLength={3000}/><button className="button-dark">Open a dispute</button></form>}</section>
            {canCancel && <section className="rounded-2xl border border-red-950 bg-red-950/10 p-5"><h2 className="font-black text-red-200">Cancel booking</h2><p className="mt-2 text-xs leading-5 text-red-200/60">Full paid deposit refund is requested automatically when cancellation happens at least {booking.studio.freeCancellationHours} hours before the session. Refund execution depends on the payment provider.</p><form action={cancelBookingAction} className="mt-4 space-y-3"><input type="hidden" name="bookingId" value={booking.id} /><textarea className="field" name="reason" placeholder="Reason (optional)" /><button className="text-xs font-black text-red-300">Cancel this booking</button></form></section>}
          </aside>
        </div>
      </section>
    </main>
  );
}
