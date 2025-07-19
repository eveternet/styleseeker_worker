import { NextResponse } from "next/server";

// Helper function to add CORS headers
function setCorsHeaders(
  response: NextResponse,
  origin?: string | null
): NextResponse {
  // Check if origin is allowed
  const isAllowedOrigin =
    origin &&
    (origin === "https://styleseeker.app" ||
      origin === "https://www.styleseeker.app" ||
      origin.endsWith(".styleseeker.app"));

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

// Handle preflight OPTIONS requests
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  console.log(`[API TEST] OPTIONS request from origin: ${origin}`);

  const response = new NextResponse(null, { status: 200 });
  return setCorsHeaders(response, origin);
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  console.log(`[API TEST] GET request from origin: ${origin}`);

  try {
    const response = NextResponse.json({
      status: "success",
      message: "StyleSeeker Worker API is working!",
      timestamp: new Date().toISOString(),
      origin: origin ?? "no-origin",
      environment: process.env.NODE_ENV ?? "development",
    });

    return setCorsHeaders(response, origin);
  } catch (error) {
    console.error("Error in test route:", error);
    const response = NextResponse.json(
      {
        status: "error",
        message: "Test endpoint failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
    return setCorsHeaders(response, origin);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  console.log(`[API TEST] POST request from origin: ${origin}`);

  try {
    const body: unknown = await request.json().catch(() => ({}));

    const response = NextResponse.json({
      status: "success",
      message: "POST test successful",
      timestamp: new Date().toISOString(),
      receivedData: body,
      origin: origin ?? "no-origin",
    });

    return setCorsHeaders(response, origin);
  } catch (error) {
    console.error("Error in test POST route:", error);
    const response = NextResponse.json(
      {
        status: "error",
        message: "POST test failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
    return setCorsHeaders(response, origin);
  }
}
