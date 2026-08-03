import { redirect } from "next/navigation";

export default async function AdminAccessPage() {
  redirect("/admin/students");
}
