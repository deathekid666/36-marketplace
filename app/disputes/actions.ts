"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

function text(form:FormData,name:string,max=2000){return String(form.get(name)||"").trim().slice(0,max)}

export async function openDisputeAction(form:FormData){
  const user=await requireUser(); const bookingId=text(form,"bookingId",80); const reason=text(form,"reason",160); const details=text(form,"details",3000);
  if(!reason)return;
  const booking=await db.booking.findUnique({where:{id:bookingId},include:{studio:true,dispute:true}});
  if(!booking||booking.dispute)return;
  const allowed=user.role==="ADMIN"||(user.role==="CREATOR"&&booking.creatorId===user.id)||(user.role==="STUDIO_OWNER"&&booking.studio.ownerId===user.id);
  if(!allowed)return;
  await db.$transaction([
    db.dispute.create({data:{bookingId,openedById:user.id,reason,details}}),
    db.booking.update({where:{id:bookingId},data:{status:"DISPUTED"}}),
    db.payout.updateMany({where:{bookingId,status:{in:["PENDING","ELIGIBLE"]}},data:{status:"HOLD"}}),
  ]);
  const admins=await db.user.findMany({where:{role:"ADMIN",status:"ACTIVE"},select:{id:true}});
  await Promise.all(admins.map(a=>notifyUser({userId:a.id,type:"DISPUTE_OPENED",title:"New booking dispute",body:`${reason} · ${booking.studio.name}`,href:"/admin/disputes",email:true})));
  revalidatePath(`/creator/bookings/${bookingId}`);revalidatePath(`/owner/bookings/${bookingId}`);revalidatePath("/admin/disputes");
  redirect(user.role==="STUDIO_OWNER"?`/owner/bookings/${bookingId}?dispute=1`:`/creator/bookings/${bookingId}?dispute=1`);
}

export async function resolveDisputeAction(form:FormData){
  const admin=await requireRole("ADMIN"); const disputeId=text(form,"disputeId",80); const resolution=text(form,"resolution",3000); const status=text(form,"status",40)==="REJECTED"?"REJECTED":"RESOLVED"; const refund=Math.max(0,Math.round(Number(form.get("refundAmountMad"))||0));
  const dispute=await db.dispute.findUnique({where:{id:disputeId},include:{booking:{include:{studio:true,payments:true}}}});if(!dispute)return;
  await db.$transaction(async tx=>{
    await tx.dispute.update({where:{id:dispute.id},data:{status,assignedAdminId:admin.id,resolution,refundAmountMad:refund,resolvedAt:new Date()}});
    if(refund>0&&status==="RESOLVED"){
      const exists=await tx.payment.findFirst({where:{bookingId:dispute.bookingId,kind:"REFUND",status:{in:["PENDING","REFUNDED"]}}});
      if(!exists)await tx.payment.create({data:{bookingId:dispute.bookingId,kind:"REFUND",amountMad:Math.min(refund,dispute.booking.totalAmountMad),currency:dispute.booking.currency,status:"PENDING",provider:process.env.PAYMENT_PROVIDER||"MANUAL",providerRef:"DISPUTE_REFUND"}});
    }
    const restored=dispute.booking.endAt<=new Date()?"COMPLETED":"CONFIRMED";
    await tx.booking.update({where:{id:dispute.bookingId},data:{status:status==="REJECTED"?restored:(refund>=dispute.booking.totalAmountMad?"CANCELLED":restored)}});
    if(status==="REJECTED"||refund===0)await tx.payout.updateMany({where:{bookingId:dispute.bookingId,status:"HOLD"},data:{status:restored==="COMPLETED"?"ELIGIBLE":"PENDING",availableAt:restored==="COMPLETED"?new Date():null}});
  });
  await Promise.all([
    notifyUser({userId:dispute.booking.creatorId,type:"DISPUTE_RESOLVED",title:`Dispute ${status.toLowerCase()}`,body:resolution||"36 has completed the dispute review.",href:`/creator/bookings/${dispute.bookingId}`,email:true}),
    notifyUser({userId:dispute.booking.studio.ownerId,type:"DISPUTE_RESOLVED",title:`Dispute ${status.toLowerCase()}`,body:resolution||"36 has completed the dispute review.",href:`/owner/bookings/${dispute.bookingId}`,email:true}),
  ]);
  revalidatePath("/admin/disputes");redirect("/admin/disputes?resolved=1");
}
