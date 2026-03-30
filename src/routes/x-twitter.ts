/**
 * X/Twitter Real-Time Search API — Hono routes
 * Endpoints:
 *  GET /api/x/search?query=keyword&sort=latest&limit=20
 *  GET /api/x/trending?country=US
 *  GET /api/x/user/:handle
 *  GET /api/x/user/:handle/tweets?limit=20
 *  GET /api/x/thread/:tweet_id
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const app = new Hono();

// ─── SCHEMAS ────────────────────────────────────────

const SearchParams = z.object({
  query: z.string().min(1),
  sort: z.enum(['latest', 'top']).optional().default('latest'),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const TrendingParams = z.object({
  country: z.string().length(2).optional().default('US'),
});

const UserTweetsParams = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ─── HELPERS ────────────────────────────────────────

async function callXAgentHelper(query: string, options: { count?: number; type?: 'Latest' | 'Top' } = {}): Promise<any> {
  const count = options.count || 20;
  const type = options.type || 'Latest';
  // search_x.py expects: --count N --type {Top,Latest} query
  const cmd = `python3 search_x.py --count ${count} --type ${type} ${JSON.stringify(query)}`;
  try {
    const { stdout } = await execAsync(cmd, { cwd: '/home/beta/.openclaw/beta/x-agent-helper', timeout: 30000 });
    return JSON.parse(stdout);
  } catch (err: any) {
    throw new Error(`X agent helper failed: ${err.message}`);
  }
}

// ─── ENDPOINTS ────────────────────────────────────────

/**
 * GET /api/x/search
 * Searches tweets by keyword/hashtag
 */
app.get('/api/x/search', async (c) => {
  try {
    const query = c.req.query('query');
    const sort = c.req.query('sort') || 'latest';
    const limit = parseInt(c.req.query('limit') || '20');

    // Validation
    const validated = SearchParams.parse({ query, sort, limit });

    // Use x-agent-helper search_x.py
    const result = await callXAgentHelper(validated.query, {
      count: validated.limit,
      type: validated.sort === 'top' ? 'Top' : 'Latest',
    });

    // Transform to expected response format
    const tweets = (result.tweets || result.data || []).map((t: any) => ({
      id: t.id_str || t.id,
      text: t.full_text || t.text,
      user: {
        handle: t.user?.screen_name || t.user?.username,
        name: t.user?.name,
        avatar: t.user?.profile_image_url_https,
        verified: t.user?.verified,
        followers: t.user?.followers_count,
      },
      metrics: {
        likes: t.favorite_count || t.likes,
        retweets: t.retweet_count,
        replies: t.reply_count,
      },
      created_at: t.created_at,
      lang: t.lang,
      source: t.source,
    }));

    return c.json({
      query: validated.query,
      count: tweets.length,
      results: tweets,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    c.status(500);
    return c.json({ error: err.message });
  }
});

/**
 * GET /api/x/trending?country=US
 * Gets trending topics by region
 */
app.get('/api/x/trending', async (c) => {
  try {
    const country = c.req.query('country') || 'US';
    // x-agent-helper does not have trending endpoint yet. Placeholder.
    return c.json({
      country,
      trends: [
        { name: '#OpenClaw', tweet_volume: 12500 },
        { name: '#AgentEconomy', tweet_volume: 8300 },
        { name: '#Web3', tweet_volume: 7200 },
      ],
      note: 'Trending endpoint requires addition to x-agent-helper; placeholder returned.',
    });
  } catch (err: any) {
    c.status(500);
    return c.json({ error: err.message });
  }
});

/**
 * GET /api/x/user/:handle
 * Get user profile by handle
 */
app.get('/api/x/user/:handle', async (c) => {
  try {
    const handle = c.req.param('handle');
    if (!handle || handle.length < 1) throw new Error('Invalid handle');
    // Placeholder — would use a user lookup script
    return c.json({
      handle,
      found: true,
      profile: {
        name: handle,
        bio: 'Sample bio',
        avatar: null,
        verified: false,
        followers: 0,
        following: 0,
        joined: '2020-01-01',
      },
      note: 'Full user lookup pending x-agent-helper implementation.',
    });
  } catch (err: any) {
    c.status(500);
    return c.json({ error: err.message });
  }
});

/**
 * GET /api/x/user/:handle/tweets?limit=20
 * Get user's recent tweets
 */
app.get('/api/x/user/:handle/tweets', async (c) => {
  try {
    const handle = c.req.param('handle');
    const limit = parseInt(c.req.query('limit') || '20');

    const result = await callXAgentHelper(`from:${handle}`, {
      count: limit,
      type: 'Latest',
    });

    const tweets = (result.tweets || result.data || []).map((t: any) => ({
      id: t.id_str || t.id,
      text: t.full_text || t.text,
      metrics: {
        likes: t.favorite_count,
        retweets: t.retweet_count,
        replies: t.reply_count,
      },
      created_at: t.created_at,
    }));

    return c.json({
      handle,
      count: tweets.length,
      tweets,
    });
  } catch (err: any) {
    c.status(500);
    return c.json({ error: err.message });
  }
});

/**
 * GET /api/x/thread/:tweet_id
 * Get tweet thread (replies)
 */
app.get('/api/x/thread/:tweet_id', async (c) => {
  try {
    const tweetId = c.req.param('tweet_id');
    if (!tweetId) throw new Error('tweet_id required');
    // Placeholder — would fetch tweet replies via x-agent-helper
    return c.json({
      tweet_id: tweetId,
      thread: [],
      note: 'Thread fetching not yet implemented in x-agent-helper.',
    });
  } catch (err: any) {
    c.status(500);
    return c.json({ error: err.message });
  }
});

export const xRouter = app;
