import { redirect } from "next/navigation";
import { requireUser, roleHome } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  redirect(roleHome(user.role));
}
