import { NextResponse } from "next/server";
import { mockDashboardMetrics } from "@/lib/mock-data";

// GET /api/results — stub that returns mock results list
export async function GET() {
  // In production, this will query the database for past analysis results

  return NextResponse.json({
    success: true,
    results: mockDashboardMetrics.recentAnalyses,
    total: mockDashboardMetrics.totalAnalyses,
  });
}
