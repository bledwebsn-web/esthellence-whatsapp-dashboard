import { NextResponse } from "next/server";
import { createSessionToken, getAuthCookieName } from "@/lib/auth";

type LoginBody = {
  username?: string;
  password?: string;
};

function isValidCredentials(username: string, password: string) {
  return (
    username === (process.env.ADMIN_USERNAME ?? "") &&
    password === (process.env.ADMIN_PASSWORD ?? "")
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!isValidCredentials(username, password)) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = await createSessionToken(username);
    const response = NextResponse.json({ success: true });

    response.cookies.set({
      name: getAuthCookieName(),
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error("Failed to login:", error);

    return NextResponse.json(
      { success: false, error: "Failed to login" },
      { status: 500 }
    );
  }
}
