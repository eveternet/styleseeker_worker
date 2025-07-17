import { NextResponse } from "next/server";
import { db } from "../../../../../server/db";
import { pluginConfigShopcada, apps } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey } from "../../../../lib/api_key/api_key";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    // Await params first
    const { appId } = await params;
    const parsedAppId = parseInt(appId);

    if (isNaN(parsedAppId) || parsedAppId <= 0) {
      return NextResponse.json({ error: "Invalid app ID" }, { status: 400 });
    }

    // Verify API key for the specific app
    const isValidApiKey = await verifyApiKey(request, parsedAppId);
    if (!isValidApiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Get the app to verify it exists
    const [app] = await db
      .select()
      .from(apps)
      .where(eq(apps.appId, parsedAppId))
      .limit(1);

    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    // Check if the app is properly configured before attempting import
    if (app.pluginName === "shopcada") {
      const [config] = await db
        .select()
        .from(pluginConfigShopcada)
        .where(eq(pluginConfigShopcada.appId, parsedAppId))
        .limit(1);

      if (!config?.apiHostname || !config?.apiKey) {
        return NextResponse.json(
          {
            error: "App configuration missing",
            message:
              "App is not properly configured. API hostname and API key are required for importing products.",
            requiresConfiguration: true,
          },
          { status: 400 },
        );
      }
    }

    // Dynamically import and create embedding service
    try {
      const { ProductEmbeddingService } = await import(
        "../../../../lib/embedding/embed_products"
      );
      const embeddingService = new ProductEmbeddingService();
      const result =
        await embeddingService.processAndStoreProducts(parsedAppId);

      return NextResponse.json(result);
    } catch (importError) {
      console.error(
        "Failed to initialize ProductEmbeddingService:",
        importError,
      );

      // Check if this is a configuration-related error
      if (
        importError instanceof Error &&
        (importError.message.includes("configuration not found") ||
          importError.message.includes("Not Found") ||
          importError.message.includes("Failed to fetch products"))
      ) {
        return NextResponse.json(
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
          { status: 400 },
        );
      }

      return NextResponse.json(
        {
          error: "Import failed",
          message:
            "Failed to import products. Please check your configuration and try again.",
          details:
            importError instanceof Error
              ? importError.message
              : "Unknown error",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error in import route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
