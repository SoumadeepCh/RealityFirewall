import { NextResponse } from "next/server";

// POST /api/analyze — Runs AMAF detection pipeline
// Note: The actual detection runs client-side (Canvas/AudioContext APIs needed).
// This route accepts the result from client-side analysis and returns a structured response.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { result } = body;

    if (!result) {
      return NextResponse.json(
        { success: false, error: "No analysis result provided" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process analysis" },
      { status: 500 }
    );
  }
}
