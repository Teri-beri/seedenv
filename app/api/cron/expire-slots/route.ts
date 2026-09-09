import { NextResponse } from "next/server";
import { expireSlots } from "@/app/actions/submissionActions";

export async function POST() {
  return NextResponse.json(await expireSlots());
}

export async function GET() {
  return NextResponse.json(await expireSlots());
}
