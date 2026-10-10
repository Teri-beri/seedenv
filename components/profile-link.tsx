import Link from "next/link";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";

export function ProfileLink({ username }: { username: string }) {
  return isPublicHandle(username) ? <Link className="hover:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-400" href={publicProfilePath(username)}>{username}</Link> : <span>{username}</span>;
}
