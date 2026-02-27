import { NextResponse } from "next/server";
import { mockAnalysisResult } from "@/lib/mock-data";

// POST /api/analyze — stub that returns mock analysis
export async function POST() {
  // In production, this will:
  // 1. Accept the file upload
  // 2. Forward to FastAPI backend for processing
  // 3. Return the real analysis results

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return NextResponse.json({
    success: true,
    result: mockAnalysisResult,
  });
}
