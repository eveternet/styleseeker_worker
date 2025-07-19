import { NextResponse } from "next/server";
import { db } from "../../../../../server/db";
import { pluginConfigShopcada, apps } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey } from "../../../../lib/api_key/api_key";

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
  console.log(`[API CORS] OPTIONS request from origin: ${origin}`);

  const response = new NextResponse(null, { status: 200 });
  return setCorsHeaders(response, origin);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  const origin = request.headers.get("origin");
  console.log(`[API CORS] POST request from origin: ${origin}`);

  try {
    // Await params first
    const { appId } = await params;
    const parsedAppId = parseInt(appId);

    if (isNaN(parsedAppId) || parsedAppId <= 0) {
      const response = NextResponse.json(
        { error: "Invalid app ID" },
        { status: 400 }
      );
      return setCorsHeaders(response, origin);
    }

    // Verify API key for the specific app
    const isValidApiKey = await verifyApiKey(request, parsedAppId);
    if (!isValidApiKey) {
      const response = NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
      return setCorsHeaders(response, origin);
    }

    // Get the app to verify it exists
    const [app] = await db
      .select()
      .from(apps)
      .where(eq(apps.appId, parsedAppId))
      .limit(1);

    if (!app) {
      const response = NextResponse.json(
        { error: "App not found" },
        { status: 404 }
      );
      return setCorsHeaders(response, origin);
    }

    // Check if the app is properly configured before attempting import
    if (app.pluginName === "shopcada") {
      const [config] = await db
        .select()
        .from(pluginConfigShopcada)
        .where(eq(pluginConfigShopcada.appId, parsedAppId))
        .limit(1);

      if (!config?.apiHostname || !config?.apiKey) {
        const response = NextResponse.json(
          {
            error: "App configuration missing",
            message:
              "App is not properly configured. API hostname and API key are required for importing products.",
            requiresConfiguration: true,
          },
          { status: 400 }
        );
        return setCorsHeaders(response, origin);
      }
    }

    // Start background import (fire and forget)
    try {
      // Start the import process in the background without waiting
      const { ProductEmbeddingService } = await import(
        "../../../../lib/embedding/embed_products"
      );

      // Process in background (don't await)
      void (async () => {
        try {
          console.log(`[Background Import] Starting for app ${parsedAppId}`);
          const embeddingService = new ProductEmbeddingService();
          const result =
            await embeddingService.processAndStoreProducts(parsedAppId);
          console.log(
            `[Background Import] Completed for app ${parsedAppId}:`,
            result.message
          );
        } catch (error) {
          console.error(
            `[Background Import] Failed for app ${parsedAppId}:`,
            error
          );
        }
      })();

      // Return success immediately
      const response = NextResponse.json({
        message: "Import started successfully in background",
        status: "processing",
        note: "This process may take several minutes to complete. Products will appear as they are processed.",
      });
      return setCorsHeaders(response, origin);
    } catch (importError) {
      console.error(
        "Failed to initialize ProductEmbeddingService:",
        importError
      );

      // Check if this is a configuration-related error
      if (
        importError instanceof Error &&
        (importError.message.includes("configuration not found") ||
          importError.message.includes("Not Found") ||
          importError.message.includes("Failed to fetch products"))
      ) {
        const response = NextResponse.json(
          {
            error: "API Configuration Issue",
            message:
              importError.message.includes("404") ||
              importError.message.includes("Not Found")
                ? "The API endpoint was not found. Please verify your API hostname is correct and includes the protocol (https://)."
                : importError.message.includes("401") ||
                    importError.message.includes("Unauthorized")
                  ? "Authentication failed. Please check that your API key is valid."
                  : importError.message.includes("Failed to fetch products")
                    ? "Could not connect to your API. Please verify your API hostname and that the service is running."
                    : "There was an issue with your app configuration. Please check that your API hostname is set correctly and that your external service is accessible.",
            details: importError.message,
            troubleshooting: [
              "1. Ensure API hostname includes protocol (e.g., https://your-shop.shopcada.com)",
              "2. Verify the /api/v3/products endpoint exists on your API",
              "3. Check that your API key is valid and has proper permissions",
              "4. Ensure your Shopcada service is running and accessible",
            ],
          },
          { status: 400 }
        );
        return setCorsHeaders(response, origin);
      }

      const response = NextResponse.json(
        {
          error: "Import failed",
          message:
            "Failed to import products. Please check your configuration and try again.",
          details:
            importError instanceof Error
              ? importError.message
              : "Unknown error",
        },
        { status: 500 }
      );
      return setCorsHeaders(response, origin);
    }
  } catch (error) {
    console.error("Error in import route:", error);
    const response = NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
    return setCorsHeaders(response, origin);
  }
}
