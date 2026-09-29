"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

function text(form: FormData, name: string, max=300){ return String(form.get(name)||"").trim().slice(0,max); }

export async function markPayoutPaidAction(form: FormData) {
  await requireRole("ADMIN");
  const payoutId=text(form,"payoutId",80);
  const reference=text(form,"reference",200);
  const payout=await db.payout.findFirst({ where:{id:payoutId,status:"ELIGIBLE"}, include:{studio:true,booking:true} });
  if(!payout) redirect("/admin/payouts?error=missing");
  await db.payout.update({ where:{id:payout.id}, data:{status:"PAID",paidAt:new Date(),reference} });
  await notifyUser({ userId:payout.studio.ownerId, type:"PAYOUT_PAID", title:`36 payout marked paid`, body:`${payout.netAmountMad} MAD for booking ${payout.bookingId.slice(0,8)}.`, href:"/owner/revenue", email:true });
  revalidatePath("/admin/payouts"); revalidatePath("/owner/revenue");
  redirect("/admin/payouts?paid=1");
}

export async function holdPayoutAction(form: FormData){
  await requireRole("ADMIN");
  const payoutId=text(form,"payoutId",80);
  const payout=await db.payout.findUnique({where:{id:payoutId}});
  if(!payout || !["PENDING","ELIGIBLE"].includes(payout.status)) return;
  await db.payout.update({where:{id:payout.id},data:{status:"HOLD"}});
  revalidatePath("/admin/payouts");
}

export async function releasePayoutAction(form: FormData){
  await requireRole("ADMIN");
  const payoutId=text(form,"payoutId",80);
  const payout=await db.payout.findUnique({where:{id:payoutId},include:{booking:true}});
  if(!payout || payout.status!=="HOLD") return;
  await db.payout.update({where:{id:payout.id},data:{status:payout.booking.status==="COMPLETED"?"ELIGIBLE":"PENDING",availableAt:payout.booking.status==="COMPLETED"?new Date():null}});
  revalidatePath("/admin/payouts");
}
