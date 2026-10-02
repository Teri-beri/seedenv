import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { uploadAvatarImage } from "@/lib/storage";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to upload a profile photo." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose a PNG or JPG image." }, { status: 400 });
    if (file.size > MAX_AVATAR_BYTES) return NextResponse.json({ message: "Image must be 2 MB or smaller." }, { status: 413 });
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      return NextResponse.json({ message: "Choose a PNG or JPG image." }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if ((file.type === "image/png" && !isPng) || (file.type === "image/jpeg" && !isJpeg)) {
      return NextResponse.json({ message: "The selected file is not a valid PNG or JPG image." }, { status: 415 });
    }

    const avatarUrl = await uploadAvatarImage({
      buffer,
      contentType: file.type,
      userId: session.user.id,
    });
    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error("SeedEnv avatar upload failed:", error);
    return NextResponse.json({ message: "Could not upload this image. Please try again." }, { status: 500 });
  }
}