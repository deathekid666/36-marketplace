import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { BookingFileUploader } from "@/components/BookingFileUploader";
import { openDisputeAction } from "@/app/disputes/actions";
import {
  completeBookingAction,
  confirmOfflinePaymentAction,
  replyToReviewAction,
} from "@/app/bookings/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";
import {
  isOfflinePaymentProvider,
  offlinePaymentLabel,
} from "@/lib/offline-payment";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

export default async function OwnerBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    completed?: string;
    error?: string;
    paid?: string;
  }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const { id } = await params;
  const query = await searchParams;

  await expireStaleBookingHolds({
    ownerId: user.id,
    limit: 150,
  });

  const booking = await db.booking.findFirst({
    where: { id, studio: { ownerId: user.id } },
    include: {
      creator: true,
      studio: true,
      room: true,
      payments: { orderBy: { createdAt: "desc" } },
      review: true,
      dispute: true,
      addons: true,
      storedFiles: true,
      payout: true,
    },
  });
  if (!booking) notFound();
  const timeZone = studioTimeZone(booking.studio);
  const canComplete =
    booking.status === "CONFIRMED" &&
    booking.paymentStatus === "PAID" &&
    booking.endAt <= new Date();
  const pendingOfflinePayments = booking.payments.filter(
    (payment) =>
      payment.status === "PENDING" &&
      isOfflinePaymentProvider(payment.provider),
  );
  const offlinePaymentMethod =
    offlinePaymentLabel(pendingOfflinePayments[0]?.provider) ||
    offlinePaymentLabel(
      booking.payments.find((payment) =>
        isOfflinePaymentProvider(payment.provider),
      )?.provider,
    );

  const messagesHref = "/messages?booking=" + booking.id;
  const bookingCode =
    "36-" + booking.id.replaceAll("-", "").slice(0, 8).toUpperCase();
  const nextStep =
    canComplete
      ? "The session has ended and payment is complete. Mark it completed to unlock the verified review flow."
      : pendingOfflinePayments.length > 0
        ? "Confirm payment only after you have actually received it from the creator."
        : booking.status === "CONFIRMED"
          ? "The reservation is confirmed. Keep access, setup and session details in the booking conversation."
          : booking.status === "COMPLETED"
            ? "This session is complete. Revenue, payout and review details remain attached here."
            : "Everything for this reservation is collected here.";

  return <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-5xl px-5 py-10"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/owner/bookings" className="text-xs font-bold text-zinc-500 hover:text-white">← Bookings</Link><span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Reservation hub · {bookingCode}</span></div><div className="mt-7 flex flex-wrap items-start justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.15em] text-acid">{booking.status.replaceAll("_", " ")}</span><h1 className="mt-2 text-4xl font-black">{booking.creator.name}</h1><p className="mt-2 text-sm text-zinc-500">{booking.studio.name} · {booking.room.name}</p><p className="mt-1 text-sm text-zinc-500">{formatMarketplaceDateTime(booking.startAt, timeZone)} → {formatMarketplaceDateTime(booking.endAt, timeZone)}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{nextStep}</p></div><div className="text-right"><b className="text-2xl">{formatMoney(booking.totalAmountMad, booking.currency)}</b><span className="block text-xs text-zinc-600">payment {booking.paymentStatus}</span></div></div><section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/40 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">Reservation controls</span><p className="mt-1 text-sm font-bold text-zinc-200">Manage the creator relationship from one booking record.</p></div><Link href={messagesHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-acid px-5 py-3 text-xs font-black text-black">Message creator</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Link href={"/bookings/" + booking.id + "/invoice"} className="rounded-xl border border-zinc-800 px-4 py-3 text-center text-xs font-black text-zinc-300 hover:border-zinc-600">View invoice</Link><Link href="/owner/availability" className="rounded-xl border border-zinc-800 px-4 py-3 text-center text-xs font-black text-zinc-300 hover:border-zinc-600">Availability</Link><Link href={"/studios/" + booking.studio.slug} className="rounded-xl border border-zinc-800 px-4 py-3 text-center text-xs font-black text-zinc-300 hover:border-zinc-600">Studio profile</Link></div></section>{query.completed && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Session marked completed. The creator can now leave a verified review.</div>}
  {query.paid && <div className="mt-6 rounded-xl border border-emerald-800/40 bg-emerald-950/15 p-4 text-sm text-emerald-300">Offline payment marked received. The booking is now financially complete.</div>}
  <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]"><div className="space-y-6"><section className="panel"><div className="flex flex-wrap items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Booking conversation</span><h2 className="mt-2 text-xl font-black">One inbox for the whole reservation</h2><p className="mt-2 max-w-xl text-xs leading-5 text-zinc-500">Access instructions, creator questions and session updates stay in the same 36 Inbox conversation.</p></div><Link href={messagesHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-acid px-5 py-3 text-xs font-black text-black">Open conversation →</Link></div></section>
  <section className="panel"><div className="flex justify-between"><h2 className="text-xl font-black">Project files</h2><span className="text-xs text-zinc-600">{booking.storedFiles.length}</span></div><div className="mt-4 space-y-2">{booking.storedFiles.map((f)=><a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex justify-between rounded-xl border border-zinc-900 p-3 text-xs"><span>{f.mimeType}</span><span className="text-zinc-600">{Math.round(Number(f.sizeBytes)/1024)} KB ↗</span></a>)}</div><BookingFileUploader bookingId={booking.id}/></section>
    {booking.review && <section className="panel"><h2 className="text-xl font-black">Creator review · {booking.review.rating}/5</h2><p className="mt-3 text-sm leading-6 text-zinc-400">{booking.review.comment || "No written comment."}</p>{booking.review.ownerReply ? <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-4"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Published host response</span><p className="mt-2 text-sm leading-6 text-zinc-400">{booking.review.ownerReply}</p><p className="mt-2 text-[10px] text-zinc-600">Public responses are publish-once and cannot be edited.</p></div> : <form action={replyToReviewAction} className="mt-4 space-y-3"><input type="hidden" name="reviewId" value={booking.review.id} /><textarea className="field" name="reply" maxLength={1500} placeholder="Public studio reply" required /><p className="text-[10px] leading-5 text-zinc-600">You can publish one public response. It cannot be edited afterward.</p><button className="button-dark">Publish response</button></form>}</section>}</div>
  <aside className="space-y-5">
  {offlinePaymentMethod && (
    <section className="rounded-2xl border border-emerald-900/35 bg-emerald-950/10 p-5">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
        Offline payment
      </span>
      <h2 className="mt-2 text-lg font-black">{offlinePaymentMethod}</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        No payment gateway is involved. Confirm receipt only after the creator has actually paid you.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-black/20 p-3 text-xs">
        <span className="text-zinc-500">Amount</span>
        <b>{formatMoney(booking.totalAmountMad, booking.currency)}</b>
      </div>
      {pendingOfflinePayments.length > 0 ? (
        <form action={confirmOfflinePaymentAction} className="mt-4">
          <input type="hidden" name="bookingId" value={booking.id} />
          <button className="w-full rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-black">
            Mark payment received
          </button>
        </form>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-900/30 p-3 text-center text-xs font-black text-emerald-300">
          Payment received ✓
        </div>
      )}
    </section>
  )}
  <section className="panel"><h2 className="text-lg font-black">Financials</h2><div className="mt-4 space-y-3 text-xs"><div className="flex justify-between"><span className="text-zinc-600">Gross</span><b>{formatMoney(booking.totalAmountMad, booking.currency)}</b></div><div className="flex justify-between"><span className="text-zinc-600">36 fee</span><b>{formatMoney(booking.commissionAmountMad, booking.currency)}</b></div><div className="flex justify-between border-t border-zinc-900 pt-3"><span className="text-zinc-500">Studio net</span><b className="text-acid">{formatMoney(booking.studioNetAmountMad, booking.currency)}</b></div>{booking.payout&&<div className="flex justify-between"><span className="text-zinc-600">Payout</span><b>{booking.payout.status}</b></div>}</div>{booking.addons.length>0&&<div className="mt-4 border-t border-zinc-900 pt-4"><span className="label">Add-ons</span>{booking.addons.map((a)=><div className="mt-2 flex justify-between text-xs" key={a.id}><span className="text-zinc-500">{a.nameSnapshot} ×{a.quantity}</span><b>{formatMoney(a.totalMad, booking.currency)}</b></div>)}</div>}</section><section className="panel"><h2 className="text-lg font-black">Creator</h2><p className="mt-3 text-sm font-bold">{booking.creator.name}</p><p className="mt-1 text-xs text-zinc-600">{booking.creator.email}</p>{booking.creator.phone && <p className="mt-1 text-xs text-zinc-600">{booking.creator.phone}</p>}</section><section className="panel"><h2 className="text-lg font-black">Support & dispute</h2>{booking.dispute ? <div className="mt-3 rounded-xl border border-amber-800/40 p-4 text-xs text-amber-200">Dispute status: <b>{booking.dispute.status}</b></div> : <form action={openDisputeAction} className="mt-4 space-y-3"><input type="hidden" name="bookingId" value={booking.id}/><input className="field" name="reason" placeholder="Reason" required/><textarea className="field" name="details" placeholder="Explain what happened"/><button className="button-dark">Open dispute</button></form>}</section>{canComplete && <form action={completeBookingAction} className="rounded-2xl border border-acid/20 bg-acid/[0.04] p-5"><input type="hidden" name="bookingId" value={booking.id} /><h2 className="font-black">Session finished?</h2><p className="mt-2 text-xs leading-5 text-zinc-500">Mark it completed to unlock verified reviews.</p><button className="mt-4 rounded-xl bg-acid px-4 py-3 text-xs font-black text-black">Mark completed</button></form>}</aside></div></section></main>;
}
