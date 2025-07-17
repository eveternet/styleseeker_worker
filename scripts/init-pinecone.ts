import { initializePineconeIndex } from "../src/app/lib/embedding/init_pinecone";

// Run the initialization
initializePineconeIndex()
  .then(() => {
    console.log("✅ Pinecone index initialization complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Pinecone index initialization failed:", error);
    process.exit(1);
  });
