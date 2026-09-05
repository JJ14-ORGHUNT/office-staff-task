import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import StaffTaskList from "./StaffTaskList";

export default async function StaffPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <StaffTaskList />;
}
