import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  SERPAPI_API_KEY: z.string().min(1, "SERPAPI_API_KEY is required"),
  FIRECRAWL_API_KEY: z.string().min(1, "FIRECRAWL_API_KEY is required"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z
    .string()
    .default("deepseek/deepseek-r1-distill-llama-70b:free"),
});

const parseConfig = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
export type Config = z.infer<typeof envSchema>;
