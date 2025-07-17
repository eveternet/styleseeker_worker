import { Pinecone } from "@pinecone-database/pinecone";

let pinecone: Pinecone | null = null;

export const getPineconeClient = async () => {
  if (pinecone) {
    return pinecone;
  }

  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  return pinecone;
};
