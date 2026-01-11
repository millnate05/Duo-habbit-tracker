import { NextResponse } from "next/server";
import webpush from "web-push";

export async function GET() {
  const keys = webpush.generateVAPIDKeys();
  return NextResponse.json(keys);
}
