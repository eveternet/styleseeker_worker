-- First, truncate existing 1408-dimension vectors to 1024 dimensions (remove trailing zeros)
UPDATE "search_ai_vector" 
SET "embedding" = (
  SELECT array_agg(val) 
  FROM (
    SELECT unnest("embedding") AS val 
    LIMIT 1024
  ) AS truncated
)::vector;

-- Then change the column type to vector(1024)
ALTER TABLE "search_ai_vector" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);