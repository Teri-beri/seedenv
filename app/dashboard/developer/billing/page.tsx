import { redirect } from "next/navigation";

export default function DeveloperBillingRedirect() {
  redirect("/console?view=billing");
}
