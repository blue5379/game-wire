import { defineCollection, z } from 'astro:content';

const gameSchema = z.object({
  title: z.string(),
  titleJa: z.string().optional(),
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

const recommendedGameSchema = z.object({
  title: z.string(),
  coverImage: z.string().optional(),
  officialUrl: z.string().optional(),
});

const sourceUrlsSchema = z.object({
  steam: z.string().optional(),
  igdb: z.string().optional(),
  metacritic: z.string().optional(),
  official: z.string().optional(), // 公式日本語ページ
});

const articleSchema = z.object({
  title: z.string(),
  category: z.enum(['newRelease', 'indie', 'feature', 'classic']),
  summary: z.string(),
  hidden: z.boolean().optional().default(false),
  articleBody: z.string().optional(),
  featureImage: z.string().optional(), // 特集記事用のAI生成画像
  recommendedGames: z.array(recommendedGameSchema).optional(), // 特集記事のおすすめゲーム
  game: gameSchema.optional(),
  sourceUrls: sourceUrlsSchema.optional(), // 参照元URL
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
  'issues-dev': issuesCollection,
};
