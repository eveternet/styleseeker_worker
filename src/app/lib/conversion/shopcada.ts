import { App, type Product, type ProductList } from "./plugin_class";
import { db } from "../../../server/db";
import { pluginConfigShopcada } from "../../../server/db/schema";
import { eq } from "drizzle-orm";

export interface ShopcadaProduct {
  product_id: number;
  name: string;
  description?: string;
  images?: string[];
  published?: boolean; // This is the correct field for published status
  pos_published?: boolean; // This is for point-of-sale published status
  categories?: Array<{ name: string }>;
  colors?: Array<{ name: string; color?: string }>;
  created_at?: string;
  modified_at?: string;
  web_url?: string;
}

export interface ShopcadaApiResponse {
  products: ShopcadaProduct[];
  meta: {
    count: number;
    page: number;
    limit: number;
  };
}

export class ShopcadaPlugin extends App {
  private apiHostname: string | null = null;
  private apiKey: string | null = null;

  async init(): Promise<void> {
    const [config] = await db
      .select()
      .from(pluginConfigShopcada)
      .where(eq(pluginConfigShopcada.appId, parseInt(this.app_id)))
      .limit(1);

    if (!config) {
      throw new Error("Shopcada plugin configuration not found");
    }

    this.apiHostname = config.apiHostname;
    this.apiKey = config.apiKey;
  }

  async getAllProducts(): Promise<ProductList> {
    if (!this.apiHostname || !this.apiKey) {
      throw new Error("Plugin not initialized. Call init() first.");
    }

    try {
      const allProducts: ShopcadaProduct[] = [];
      const currentPage = 0;
      let totalPages = 1;

      // First call to get initial data and metadata
      const firstPageUrl = `${this.apiHostname}/api/v3/products?page=${currentPage}&limit=20`;
      console.log(`[Shopcada] Fetching page ${currentPage}: ${firstPageUrl}`);

      const firstResponse = await fetch(firstPageUrl, {
        headers: {
          "X-Shopcada-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
      });

      console.log(
        `[Shopcada] Page ${currentPage} response status: ${firstResponse.status} ${firstResponse.statusText}`,
      );

      if (!firstResponse.ok) {
        const errorText = await firstResponse.text();
        console.error(`[Shopcada] Error response body:`, errorText);

        throw new Error(
          `Failed to fetch products: ${firstResponse.status} ${firstResponse.statusText}. ` +
            `URL: ${firstPageUrl}. ` +
            `Response: ${errorText.substring(0, 200)}${errorText.length > 200 ? "..." : ""}`,
        );
      }

      const firstData = (await firstResponse.json()) as ShopcadaApiResponse;

      if (!firstData.products || !Array.isArray(firstData.products)) {
        throw new Error(
          `Invalid response format: expected object with products array. Got: ${typeof firstData}`,
        );
      }

      // Add first page products
      allProducts.push(...firstData.products);

      // Calculate total pages needed
      const totalProducts = firstData.meta?.count || firstData.products.length;
      const limit = firstData.meta?.limit || 20;
      totalPages = Math.ceil(totalProducts / limit);

      console.log(
        `[Shopcada] Total products: ${totalProducts}, Limit: ${limit}, Total pages: ${totalPages}`,
      );
      console.log(
        `[Shopcada] Page ${currentPage} fetched ${firstData.products.length} products`,
      );

      // Fetch remaining pages if there are more
      if (totalPages > 1) {
        const remainingPages = [];
        for (let page = 1; page < totalPages; page++) {
          remainingPages.push(page);
        }

        console.log(
          `[Shopcada] Fetching ${remainingPages.length} additional pages...`,
        );

        // Fetch remaining pages in parallel (but with some delay to be nice to the API)
        for (const page of remainingPages) {
          const pageUrl = `${this.apiHostname}/api/v3/products?page=${page}&limit=20`;
          console.log(`[Shopcada] Fetching page ${page}: ${pageUrl}`);

          const response = await fetch(pageUrl, {
            headers: {
              "X-Shopcada-API-Key": this.apiKey,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            console.error(
              `[Shopcada] Failed to fetch page ${page}: ${response.status} ${response.statusText}`,
            );
            continue; // Skip this page but continue with others
          }

          const data = (await response.json()) as ShopcadaApiResponse;
          if (data.products && Array.isArray(data.products)) {
            allProducts.push(...data.products);
            console.log(
              `[Shopcada] Page ${page} fetched ${data.products.length} products`,
            );
          }

          // Small delay to be nice to the API
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(
        `[Shopcada] Fetched ${allProducts.length} total products from ${totalPages} pages`,
      );

      if (allProducts.length > 0) {
        console.log(
          `[Shopcada] Sample product fields:`,
          Object.keys(allProducts[0]),
        );
        console.log(
          `[Shopcada] Sample product published:`,
          allProducts[0].published,
        );
      }

      const products: Product[] = await Promise.all(
        allProducts.map((product: ShopcadaProduct) =>
          this.processProduct(product),
        ),
      );

      return { products };
    } catch (error) {
      console.error("Error fetching products:", error);

      // Enhanced error message with debugging info
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to fetch products: ${errorMessage}. ` +
          `Check that: 1) API hostname includes protocol (https://), ` +
          `2) /api/v3/products endpoint exists, 3) API key is valid and uses X-Shopcada-API-Key header`,
      );
    }
  }

  async getProductById(productId: string): Promise<Product | null> {
    if (!this.apiHostname || !this.apiKey) {
      throw new Error("Plugin not initialized. Call init() first.");
    }

    try {
      const response = await fetch(
        `${this.apiHostname}/api/v3/products/${productId}`,
        {
          headers: {
            "X-Shopcada-API-Key": this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch product: ${response.statusText}`);
      }

      const data = (await response.json()) as ShopcadaProduct;
      return this.processProduct(data);
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error);
      throw new Error(
        `Failed to fetch product ${productId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Safely converts unknown values to strings
   */
  private safeStringify(value: unknown, fallback = ""): string {
    if (typeof value === "string") {
      return value;
    }

    if (value === null || value === undefined) {
      return fallback;
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return fallback;
      }
    }

    // For numbers, booleans, etc. - explicitly check for primitives
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    // For any other type, return fallback to be safe
    return fallback;
  }

  /**
   * Safely converts unknown values to optional strings
   */
  private safeOptionalStringify(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    const result = this.safeStringify(value);
    return result === "" ? undefined : result;
  }

  public processProduct(product: unknown): Product {
    if (!product || typeof product !== "object") {
      throw new Error("Invalid product data provided");
    }

    const productObj = product as Record<string, unknown>;

    if (!productObj.product_id || !productObj.name) {
      throw new Error("Product must have product_id and name fields");
    }

    const productId = Number(productObj.product_id);
    const name = this.safeStringify(productObj.name);
    const description = this.safeOptionalStringify(productObj.description);

    const images = Array.isArray(productObj.images)
      ? (productObj.images as string[])
      : undefined;

    // Handle categories
    const categories = Array.isArray(productObj.categories)
      ? (productObj.categories as Array<{ name: string }>)
          .map((cat) => cat.name)
          .filter(Boolean)
      : [];
    const categoriesString = categories.length > 0 ? categories.join(", ") : "";

    // Handle colors
    const colors = Array.isArray(productObj.colors)
      ? (productObj.colors as Array<{ name: string; color?: string }>)
          .map((col) => col.name)
          .filter(Boolean)
      : [];
    const colorsString = colors.length > 0 ? colors.join(", ") : "";

    // Get color hex value
    const colorHex = Array.isArray(productObj.colors)
      ? ((productObj.colors as Array<{ color?: string }>).find(
          (col) => col.color,
        )?.color ?? "")
      : "";

    // Build final description
    const finalDescription = [
      description ?? "",
      categoriesString && `Categories: ${categoriesString}`,
      colorsString && `Colors: ${colorsString}`,
      colorHex && `Color code: ${colorHex}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Handle published status
    const published =
      typeof productObj.published === "boolean" ? productObj.published : false; // Default to false if not provided

    console.log(
      `[Shopcada] Processing product ${productId}: published=${published}`,
    );

    return {
      product_id: productId,
      name,
      description: finalDescription,
      images,
      isPublished: published,
    };
  }

  async updateProduct(productInfo: unknown): Promise<Product> {
    return this.processProduct(productInfo);
  }
}

export { ShopcadaPlugin as ShopcadaPluginInfo };
