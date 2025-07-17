import { Pinecone } from "@pinecone-database/pinecone";

export async function initializePineconeIndex() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY environment variable is required");
  }

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const indexName = "search-ai";

  try {
    // Try to describe the index first
    const hasIndex = await pinecone.describeIndex(indexName).catch(() => false);

    if (!hasIndex) {
      console.log(`Creating new Pinecone index: ${indexName}`);
      await pinecone.createIndexForModel({
        name: indexName,
        cloud: "aws",
        region: "us-east-1",
        embed: {
          model: "llama-text-embed-v2",
          fieldMap: { text: "text" },
        },
        waitUntilReady: true,
      });
      console.log(
        "Index created successfully with llama-text-embed-v2 integration",
      );
    } else {
      console.log(`Index ${indexName} already exists`);
    }

    return true;
  } catch (error) {
    console.error("Error initializing Pinecone index:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    throw error;
  }
}
