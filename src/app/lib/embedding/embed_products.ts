import { Pinecone } from "@pinecone-database/pinecone";
import createApp from "../conversion/conversion_layer";
import get_plugin_name from "../conversion/get_plugin_name";
import visionService from "./multimodal_processor";
import { db } from "../../../server/db";
import { vectors } from "../../../server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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
          (error instanceof Error ? error.message : "Unknown error")
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
        `Failed to get products for app ${appId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  public async processProduct(
    product: Product,
    appId: number
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
          eq(vectors.imageUrls, imageUrlChecksum)
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
        `\n🖼️ Processing ${product.images.length} images for: ${product.name}`
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
    appId: number
  ): Promise<void> {
    if (products.length === 0) return;

    const index = this.pinecone.index(this.indexName);
    const namespace = `app_${appId}`;

    // Define batch size for Pinecone operations (to avoid 413 errors)
    const PINECONE_BATCH_SIZE = 50;

    try {
      // Create Pinecone records
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
        `[Pinecone] Upserting ${pineconeRecords.length} records to namespace: ${namespace} in batches of ${PINECONE_BATCH_SIZE}`
      );

      // Process Pinecone upserts in batches
      for (let i = 0; i < pineconeRecords.length; i += PINECONE_BATCH_SIZE) {
        const batch = pineconeRecords.slice(i, i + PINECONE_BATCH_SIZE);
        const batchNumber = Math.floor(i / PINECONE_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(
          pineconeRecords.length / PINECONE_BATCH_SIZE
        );

        console.log(
          `[Pinecone] Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`
        );

        batch.forEach((record) => {
          console.log(
            `[Pinecone] Product ${record.id}: isPublished=${record.isPublished}`
          );
        });

        try {
          await index.namespace(namespace).upsertRecords(batch);
          console.log(
            `[Pinecone] Successfully upserted batch ${batchNumber}/${totalBatches}`
          );
        } catch (batchError) {
          console.error(
            `[Pinecone] Failed to upsert batch ${batchNumber}/${totalBatches}:`,
            batchError
          );
          throw batchError;
        }

        // Small delay between batches to be respectful to the API
        if (i + PINECONE_BATCH_SIZE < pineconeRecords.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`[Pinecone] All batches completed successfully`);

      // Then, upsert to our database (also in batches for large datasets)
      console.log(
        `[Database] Upserting ${products.length} products to database`
      );
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

      console.log(`[Database] All products upserted successfully`);
    } catch (error) {
      console.error("Error in batchInsertProducts:", error);
      throw error;
    }
  }

  public async processAndStoreProducts(
    appId: number
  ): Promise<ProcessingResult> {
    try {
      const { products } = await this.getPluginProducts(appId);

      if (!products || !Array.isArray(products)) {
        throw new Error(`Invalid products data returned for app ${appId}`);
      }

      console.log(
        `Processing ${products.length} products for app ${appId} in batches of 100`
      );

      const PROCESSING_BATCH_SIZE = 100;
      let totalProcessedProducts = 0;
      const totalBatches = Math.ceil(products.length / PROCESSING_BATCH_SIZE);

      // Process products in batches of 100 through the entire pipeline
      for (let i = 0; i < products.length; i += PROCESSING_BATCH_SIZE) {
        const batch = products.slice(i, i + PROCESSING_BATCH_SIZE);
        const batchNumber = Math.floor(i / PROCESSING_BATCH_SIZE) + 1;

        console.log(
          `\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} products)`
        );

        // Step 1: Process multimodal for this batch IN PARALLEL
        console.log(
          `[Batch ${batchNumber}] Step 1: Processing with multimodal processor (PARALLEL)...`
        );

        const startTime = Date.now();
        const processedProducts = await this.processProductsBatchParallel(
          batch,
          appId,
          batchNumber
        );
        const endTime = Date.now();
        const processingTimeSeconds = ((endTime - startTime) / 1000).toFixed(1);

        console.log(
          `[Batch ${batchNumber}] Completed ${processedProducts.length}/${batch.length} products in ${processingTimeSeconds}s`
        );

        // Step 2: Store this batch in database and Pinecone
        if (processedProducts.length > 0) {
          console.log(
            `[Batch ${batchNumber}] Step 2: Storing ${processedProducts.length} products in database and Pinecone...`
          );

          try {
            await this.batchInsertProducts(processedProducts, appId);
            totalProcessedProducts += processedProducts.length;
            console.log(
              `✅ [Batch ${batchNumber}] Successfully stored ${processedProducts.length} products. Total processed: ${totalProcessedProducts}/${products.length}`
            );
          } catch (error) {
            console.error(
              `❌ [Batch ${batchNumber}] Failed to store products:`,
              error
            );
            // Continue with next batch even if this one fails
          }
        } else {
          console.log(
            `⚠️ [Batch ${batchNumber}] No products were successfully processed in this batch`
          );
        }

        // Small delay between batches to prevent overwhelming the system
        if (i + PROCESSING_BATCH_SIZE < products.length) {
          console.log(
            `[Batch ${batchNumber}] Waiting 1 second before next batch...`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(
        `\n🎉 Completed processing all ${totalBatches} batches. Total products processed: ${totalProcessedProducts}/${products.length}`
      );

      return {
        message:
          totalProcessedProducts === products.length
            ? "All products processed and stored successfully"
            : `Processed ${totalProcessedProducts} out of ${products.length} products`,
        imported_count: totalProcessedProducts,
        status: totalProcessedProducts > 0 ? 200 : 500,
      };
    } catch (error) {
      console.error("Error in processAndStoreProducts:", error);
      throw error;
    }
  }

  /**
   * Process a batch of products in parallel for much faster multimodal processing
   */
  private async processProductsBatchParallel(
    products: Product[],
    appId: number,
    batchNumber: number
  ): Promise<StoreInfo[]> {
    // Pre-fetch existing image descriptions for this batch to avoid unnecessary API calls
    const imageChecksums = products
      .map((p) => (p.images?.[0] ? generateChecksum(p.images[0]) : null))
      .filter(Boolean) as string[];

    const existingDescriptions = new Map<string, string>();

    if (imageChecksums.length > 0) {
      console.log(
        `[Batch ${batchNumber}] Pre-checking ${imageChecksums.length} image descriptions...`
      );

      const existingVectors = await db.query.vectors.findMany({
        where: and(
          eq(vectors.appId, appId),
          inArray(vectors.imageUrls, imageChecksums)
        ),
        columns: {
          imageUrls: true,
          imageDescription: true,
        },
      });

      for (const vector of existingVectors) {
        if (vector.imageUrls && vector.imageDescription) {
          existingDescriptions.set(vector.imageUrls, vector.imageDescription);
        }
      }

      console.log(
        `[Batch ${batchNumber}] Found ${existingDescriptions.size} cached image descriptions`
      );
    } else {
      console.log(
        `[Batch ${batchNumber}] No images to pre-check in this batch`
      );
    }

    // Separate products that need image processing vs those that don't
    const productsNeedingImageProcessing: Product[] = [];
    const productsWithCachedImages: Product[] = [];

    for (const product of products) {
      const firstImageUrl = product.images?.[0];
      if (firstImageUrl) {
        const checksum = generateChecksum(firstImageUrl);
        if (existingDescriptions.has(checksum)) {
          productsWithCachedImages.push(product);
        } else {
          productsNeedingImageProcessing.push(product);
        }
      } else {
        // No images, process immediately
        productsWithCachedImages.push(product);
      }
    }

    console.log(
      `[Batch ${batchNumber}] ${productsWithCachedImages.length} products have cached data, ${productsNeedingImageProcessing.length} need image processing`
    );

    // Maximum concurrent API calls to avoid overwhelming OpenRouter
    const MAX_CONCURRENT_API_CALLS = 10;

    // Process products in smaller concurrent groups
    const results: StoreInfo[] = [];

    // First, quickly process products with cached images (no API calls needed)
    for (const product of productsWithCachedImages) {
      try {
        const result = await this.processProductWithCache(
          product,
          appId,
          existingDescriptions
        );
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(
          `[Batch ${batchNumber}] ❌ Failed to process cached product ${product.product_id}:`,
          error
        );
      }
    }

    // Then process products that need image processing in parallel
    for (
      let i = 0;
      i < productsNeedingImageProcessing.length;
      i += MAX_CONCURRENT_API_CALLS
    ) {
      const concurrentGroup = productsNeedingImageProcessing.slice(
        i,
        i + MAX_CONCURRENT_API_CALLS
      );

      console.log(
        `[Batch ${batchNumber}] Processing ${concurrentGroup.length} products with new images concurrently (${i + 1}-${Math.min(i + MAX_CONCURRENT_API_CALLS, productsNeedingImageProcessing.length)}/${productsNeedingImageProcessing.length})`
      );

      // Process this group of products in parallel
      const promises = concurrentGroup.map(async (product) => {
        try {
          const result = await this.processProduct(product, appId);
          if (result) {
            console.log(
              `[Batch ${batchNumber}] ✅ Processed product ${result.product_id} (with new image processing)`
            );
          }
          return result;
        } catch (error) {
          console.error(
            `[Batch ${batchNumber}] ❌ Failed to process product ${product.product_id}:`,
            error
          );
          return null;
        }
      });

      // Wait for all concurrent API calls to complete
      const groupResults = await Promise.all(promises);

      // Add successful results
      for (const result of groupResults) {
        if (result) {
          results.push(result);
        }
      }

      // Small delay between concurrent groups to be respectful to the API
      if (
        i + MAX_CONCURRENT_API_CALLS <
        productsNeedingImageProcessing.length
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Process a product that has cached image description (fast path)
   */
  private async processProductWithCache(
    product: Product,
    appId: number,
    cachedDescriptions: Map<string, string>
  ): Promise<StoreInfo | null> {
    const firstImageUrl = product.images?.[0];
    const baseText = `${product.name} ${product.description ?? ""}`;

    let imageDescription: string | undefined;
    let imageUrlChecksum: string | undefined;

    if (firstImageUrl) {
      imageUrlChecksum = generateChecksum(firstImageUrl);
      imageDescription = cachedDescriptions.get(imageUrlChecksum);
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

  public async upsertSingleProduct(
    product: Product,
    appId: number
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
    appId: number
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
        error
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
    isPublished: boolean
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
        error
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
    isPublished: boolean
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
        error
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
