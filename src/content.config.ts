import { defineCollection, z } from 'astro:content';

const gameSchema = z.object({
  title: z.string(),
  genre: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  releaseDate: z.string().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
  developerCountry: z.string().optional(),
  coverImage: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
  metascore: z.number().nullable().optional(),
  userScore: z.number().nullable().optional(),
  isAiInferred: z.boolean().optional(),
  aiInferredFields: z.array(z.string()).optional(),
});

const articleSchema = z.object({
  title: z.string(),
  category: z.enum(['newRelease', 'indie', 'feature', 'classic']),
  summary: z.string(),
  articleBody: z.string().optional(),
  featureImage: z.string().optional(), // 特集記事用のAI生成画像
  game: gameSchema.optional(),
});

const issuesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    issueNumber: z.number(),
    publishDate: z.coerce.date(),
    title: z.string(),
    description: z.string(),
    articles: z.array(articleSchema),
  }),
});

export const collections = {
  issues: issuesCollection,
};
