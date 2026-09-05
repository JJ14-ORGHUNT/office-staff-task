import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffHistory from "./StaffHistory";

export default async function StaffHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <StaffHistory />;
}
