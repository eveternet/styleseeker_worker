import { Pinecone } from "@pinecone-database/pinecone";
import createApp from "../conversion/conversion_layer";
import get_plugin_name from "../conversion/get_plugin_name";
import visionService from "./multimodal_processor";
import { db } from "../../../server/db";
import { vectors } from "../../../server/db/schema";
import { eq, and } from "drizzle-orm";
import type { Product } from "../conversion/plugin_class";

// Simple checksum function that's efficient for text comparison
function generateChecksum(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum = (sum << 5) - sum + input.charCodeAt(i);
    sum = sum & sum; // Convert to 32-bit integer
  }
  // Convert to base36 for compact string representation
  return Math.abs(sum).toString(36);
}

interface StoreInfo {
  product_id: string;
  product_name: string;
  product_description: string;
  text: string;
  text_checksum: string;
  image_description?: string;
  first_image_url?: string;
  image_url_checksum?: string;
  isPublished: boolean;
}

interface ProcessingResult {
  message: string;
  imported_count: number;
  status: number;
}

export class ProductEmbeddingService {
  private pinecone: Pinecone;
  private indexName = "search-ai";
  private namespace: string;

  constructor() {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }

    try {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      this.namespace = "";
    } catch (error) {
      console.error("Failed to initialize Pinecone client:", error);
      throw new Error(
        "Failed to initialize Pinecone client: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }

  private async getPluginProducts(appId: number) {
    try {
      const plugin_name = await get_plugin_name(String(appId));
      if (!plugin_name) {
        throw new Error(`Plugin not found for app ID: ${appId}`);
      }

      const app = createApp(plugin_name, String(appId));
      await app.init(); // Make sure to initialize the app
      return app.getAllProducts();
    } catch (error) {
      console.error(`Failed to get products for app ${appId}:`, error);
      throw new Error(
        `Failed to get products for app ${appId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async processProduct(
    product: Product,
    appId: number,
  ): Promise<StoreInfo | null> {
    const firstImageUrl =
      product.images && product.images.length > 0
        ? product.images[0]
        : undefined;

    // Generate base text without image description
    const baseText = `${product.name} ${product.description ?? ""}`;
    const imageUrlChecksum = firstImageUrl
      ? generateChecksum(firstImageUrl)
      : undefined;

    // Check if we have an existing vector with the same image URL
    let existingImageDescription: string | undefined;
    if (imageUrlChecksum) {
      const existingVector = await db.query.vectors.findFirst({
        where: and(
          eq(vectors.appId, appId),
          eq(vectors.imageUrls, imageUrlChecksum),
        ),
      });
      if (existingVector) {
        console.log("✅ Found existing image description for:", product.name);
        existingImageDescription = existingVector.imageDescription ?? undefined;
      }
    }

    // Process images only if we don't have an existing description
    let imageDescription = existingImageDescription;
    if (
      product.images &&
      product.images.length > 0 &&
      !existingImageDescription
    ) {
      console.log(
        `\n🖼️ Processing ${product.images.length} images for: ${product.name}`,
      );

      try {
        imageDescription =
          (await visionService.describeImages(product.images, product.name)) ??
          undefined;

        if (!imageDescription) {
          console.log("❌ Vision service returned empty description");
        } else {
          // Format image description with proper newlines
          imageDescription = imageDescription
            // First normalize any existing line breaks or multiple spaces
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\s+/g, " ")
            .trim()
            // Split on common sentence boundaries
            .replace(/([.!?]) /g, "$1\n")
            .replace(/(\w+)([,;]) /g, "$1$2\n")
            // Clean up any empty lines
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join("\n");

          console.log("✅ Vision service description:", imageDescription);
        }
      } catch (error) {
        console.error("❌ Vision service error:", error);
        if (error instanceof Error) {
          console.error("Error details:", {
            message: error.message,
            stack: error.stack,
          });
        }
      }
    }

    // Combine text and image description for final text
    const finalText = [baseText, imageDescription].filter(Boolean).join("\n");
    const finalTextChecksum = generateChecksum(finalText);

    return {
      product_id: product.product_id.toString(),
      product_name: product.name,
      product_description: product.description ?? "",
      text: finalText,
      text_checksum: finalTextChecksum,
      image_description: imageDescription,
      first_image_url: firstImageUrl,
      image_url_checksum: imageUrlChecksum,
      isPublished: product.isPublished,
    };
  }

  private async batchInsertProducts(
    products: StoreInfo[],
    appId: number,
  ): Promise<void> {
    if (products.length === 0) return;

    const index = this.pinecone.index(this.indexName);
    const namespace = `app_${appId}`;

    try {
      // First, upsert to Pinecone with metadata including isPublished
      const pineconeRecords = products.map((product) => ({
        id: product.product_id.toString(),
        text: product.text,
        description: product.image_description ?? "",
        firstImageUrl: product.first_image_url ?? "",
        productName: product.product_name,
        productDescription: product.product_description,
        productId: product.product_id.toString(),
        isPublished: product.isPublished,
      }));

      console.log(
        `[Pinecone] Upserting ${pineconeRecords.length} records to namespace: ${namespace}`,
      );
      pineconeRecords.forEach((record) => {
        console.log(
          `[Pinecone] Product ${record.id}: isPublished=${record.isPublished}`,
        );
      });

      await index.namespace(namespace).upsertRecords(pineconeRecords);

      // Then, upsert to our database
      for (const product of products) {
        await db
          .insert(vectors)
          .values({
            appId,
            productId: product.product_id,
            productName: product.product_name,
            fullText: product.text_checksum,
            imageUrls: product.image_url_checksum ?? "",
            imageDescription: product.image_description,
            isPublished: product.isPublished,
          })
          .onConflictDoUpdate({
            target: [vectors.appId, vectors.productId],
            set: {
              productName: product.product_name,
              fullText: product.text_checksum,
              imageUrls: product.image_url_checksum ?? "",
              imageDescription: product.image_description,
              isPublished: product.isPublished,
            },
          });
      }
    } catch (error) {
      console.error("Error in batchInsertProducts:", error);
      throw error;
    }
  }

  public async processAndStoreProducts(
    appId: number,
  ): Promise<ProcessingResult> {
    try {
      const { products } = await this.getPluginProducts(appId);

      if (!products || !Array.isArray(products)) {
        throw new Error(`Invalid products data returned for app ${appId}`);
      }

      console.log(`Processing ${products.length} products for app ${appId}`);
      const processedProducts: StoreInfo[] = [];

      for (const product of products) {
        try {
          console.log(
            `[Import] Processing product ${product.product_id}: isPublished=${product.isPublished}`,
          );
          const processedProduct = await this.processProduct(product, appId);
          if (processedProduct) {
            console.log(
              `[Import] Processed product ${processedProduct.product_id}: isPublished=${processedProduct.isPublished}`,
            );
            processedProducts.push(processedProduct);
          }
        } catch (error) {
          console.error(
            `Failed to process product ${product.product_id}:`,
            error,
          );
          // Continue processing other products
        }
      }

      if (processedProducts.length > 0) {
        await this.batchInsertProducts(processedProducts, appId);
      }

      return {
        message:
          processedProducts.length === products.length
            ? "All products processed and stored successfully"
            : `Processed ${processedProducts.length} out of ${products.length} products`,
        imported_count: processedProducts.length,
        status: processedProducts.length > 0 ? 200 : 500,
      };
    } catch (error) {
      console.error("Error in processAndStoreProducts:", error);
      throw error;
    }
  }

  public async upsertSingleProduct(
    product: Product,
    appId: number,
  ): Promise<ProcessingResult> {
    try {
      const processedProduct = await this.processProduct(product, appId);
      if (processedProduct) {
        await this.batchInsertProducts([processedProduct], appId);
        return {
          message: "Product processed and stored successfully",
          imported_count: 1,
          status: 200,
        };
      } else {
        return {
          message: "Failed to process product",
          imported_count: 0,
          status: 500,
        };
      }
    } catch (error) {
      console.error("Error upserting single product:", error);
      throw error;
    }
  }

  public async deleteProduct(
    productId: string,
    appId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get namespace-specific index
      const index = this.pinecone.index(this.indexName);
      const namespace = `app_${appId}`;

      // Delete from Pinecone
      await index.namespace(namespace).deleteOne(productId);

      // Delete from your database
      await db
        .delete(vectors)
        .where(and(eq(vectors.appId, appId), eq(vectors.productId, productId)));

      return {
        success: true,
        message: `Product ${productId} deleted successfully from app ${appId}`,
      };
    } catch (error) {
      console.error(
        `Error deleting product ${productId} from app ${appId}:`,
        error,
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async setPublishedStatus(
    productId: string,
    appId: number,
    isPublished: boolean,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get namespace-specific index
      const index = this.pinecone.index(this.indexName);
      const namespace = `app_${appId}`;

      // Update in Pinecone - you need to update the metadata, not the vector itself
      await index.namespace(namespace).update({
        id: productId,
        metadata: {
          isPublished: isPublished,
        },
      });

      // Update in your database
      await db
        .update(vectors)
        .set({ isPublished: isPublished })
        .where(and(eq(vectors.appId, appId), eq(vectors.productId, productId)));

      return {
        success: true,
        message: `Published status for product ${productId} in app ${appId} set to ${isPublished}`,
      };
    } catch (error) {
      console.error(
        `Error setting published status for product ${productId} in app ${appId}:`,
        error,
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async setPublishedStatusWithFetch(
    productId: string,
    appId: number,
    isPublished: boolean,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // First, check if the product exists in our database
      const existingProduct = await db.query.vectors.findFirst({
        where: and(eq(vectors.appId, appId), eq(vectors.productId, productId)),
      });

      if (existingProduct) {
        // Product exists, just update the published status
        return await this.setPublishedStatus(productId, appId, isPublished);
      } else {
        // Product doesn't exist, fetch it from the API and upsert
        const plugin_name = await get_plugin_name(String(appId));
        if (!plugin_name) {
          throw new Error(`Plugin not found for app ID: ${appId}`);
        }

        const app = createApp(plugin_name, String(appId));
        await app.init();

        // Check if the plugin has a getProductById method
        if (typeof app.getProductById === "function") {
          const product = await app.getProductById(productId);
          if (product) {
            // Override the published status with the webhook value
            product.isPublished = isPublished;

            // Upsert the product
            const result = await this.upsertSingleProduct(product, appId);

            return {
              success: result.status === 200,
              message:
                result.status === 200
                  ? `Product ${productId} fetched and published status set to ${isPublished}`
                  : `Failed to fetch and upsert product ${productId}`,
            };
          } else {
            return {
              success: false,
              message: `Product ${productId} not found in external API`,
            };
          }
        } else {
          return {
            success: false,
            message: `Plugin ${plugin_name} does not support fetching individual products`,
          };
        }
      }
    } catch (error) {
      console.error(
        `Error setting published status with fetch for product ${productId} in app ${appId}:`,
        error,
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
