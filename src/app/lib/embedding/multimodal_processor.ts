import { getAIResponse } from "../openrouter";

const SYSTEM_PROMPT = `You are a helpful assistant that describes fashion product images.
The user prompt will be the fashion product's official name or title.
Your output must be a concise list of points, one per line, describing ONLY the specific fashion item identified by its name.
DO NOT MAKE STUFF UP. IF YOU CANNOT KNOW FOR SURE IF SOMETHING IS TRUE, DO NOT SAY IT.
DO NOT MENTION COLORS AT ALL.
Ensure accuracy in all details. If an attribute is not clearly discernible from the image, omit it rather than guessing.
Each point should be a very short phrase or keyword, avoiding complete sentences and unnecessary connecting words.
Focus on key visual attributes such as silhouette, fabric, fit, design elements, construction details, and any distinctive features.
If given multiple images (additional angle shots of the same item), do not redescribe them as new items.
DO NOT describe any other items, props, background elements, or staging present in the image that are not part of the named fashion product itself.
Use precise fashion terminology and keywords as often as possible (e.g., for a "Cotton Button-Down Shirt," output "Button-down shirt," "Cotton," "Collared," "Long sleeves," "Chest pocket." Be specific about features like "Slim fit," "French cuffs," if clearly visible).
The output should be in the same language as the product name and contain no other text formatting.
Crucially, each point must be on its own line without any preceding characters like hyphens, bullets, or numbers.
Limit your description to a maximum of 10 key points.
When describing product variants visible in the image (e.g., multiple sizes, styles), list each variant on its own line.
Only describe what is visually apparent in the image - do not infer care instructions, fabric composition, or other details not clearly visible.
Prioritize features in this order:
1) Primary garment category
2) Visible fabric texture or material appearance
3) Silhouette/fit
4) Key design elements and construction details
5) Visible functionality and styling features
6) Specific occasions or styling contexts (only if clearly suggested by the garment's visible style)
7) Target demographic or style category (only if clearly inferable from visible design)
8) Any visible labels, tags, or technical details.

For occasions, styling contexts, or target demographic, only include these if they are clearly suggested by the visible design and styling of the garment.

Example good output:
Blazer
Textured fabric
Tailored fit
Notched lapels
Two-button closure
Chest pocket
Side vents
Business professional
Office wear
Formal occasions

Example bad output:
- Stylish blazer for modern women (avoid subjective descriptions)
- Comes with tags attached (irrelevant detail)
- Dry clean only (not visually apparent)
- Model wearing it (background elements)
- Trendy design (too vague)`;

function validateImageUrlsMatchProduct(
  imageUrls: string[],
  productName: string,
): { isValid: boolean; warning?: string } {
  // Extract product name keywords (ignore common words)
  const keywords = productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(
      (word) =>
        ![
          "in",
          "the",
          "a",
          "an",
          "and",
          "or",
          "for",
          "to",
          "of",
          "backorder",
        ].includes(word),
    );

  // Check if any image URL contains any of the keywords
  const anyMatch = imageUrls.some((url) => {
    const urlPath = url.toLowerCase();
    return keywords.some((keyword) => urlPath.includes(keyword));
  });

  if (!anyMatch) {
    return {
      isValid: true, // Still allow processing
      warning: `Image URLs don't seem to match product name "${productName}". First image: ${imageUrls[0]}`,
    };
  }

  return { isValid: true };
}

/**
 * Vision Service
 * Handles image description using Gemini Pro Vision
 */
export class VisionService {
  private systemPrompt: string;

  constructor() {
    // Use embedded system prompt instead of reading from file
    this.systemPrompt = SYSTEM_PROMPT;
  }

  /**
   * Describes multiple images of a product using Gemini Pro Vision
   */
  async describeImages(
    imageUrls: string[],
    productName: string,
  ): Promise<string> {
    try {
      // Validate that images match the product
      const validation = validateImageUrlsMatchProduct(imageUrls, productName);
      if (validation.warning) {
        console.warn("⚠️", validation.warning);
      }

      return await getAIResponse(this.systemPrompt, productName, imageUrls);
    } catch (error) {
      console.error("\n❌ Error in vision processing:");
      console.error("Error details:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }
}

// Create a singleton instance
const visionService = new VisionService();
export default visionService;
