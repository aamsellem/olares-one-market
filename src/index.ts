import catalog from './catalog.json';
import charts from './charts.json';

interface Env {}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

// GET /api/v1/appstore/hash?version=X
function handleHash(url: URL): Response {
  const version = url.searchParams.get('version') || '1.12.3';
  return json({
    hash: catalog.hash,
    last_updated: isoNanos(),
    version,
  });
}

// GET /api/v1/appstore/info?version=X
// Go market service strict-parses timestamps as `2006-01-02T15:04:05.000000000Z` (9-digit nanos).
// JavaScript `toISOString()` emits only 3-digit ms — pad to 9 to be parseable by the Go syncer.
function isoNanos(d: Date = new Date()): string {
  return d.toISOString().replace(/\.(\d+)Z$/, (_m, ms) => `.${ms.padEnd(9, '0')}Z`);
}

function handleInfo(url: URL): Response {
  const version = url.searchParams.get('version') || '1.12.3';
  const now = isoNanos();

  // Studio sidebar: menuList = response.tags. categoryMenu = menuList filtered by app categories.
  // Custom category names DO work as long as they appear in both the apps' categories array
  // and our tags object (verified against beclab/Olares menu store source code).
  const categoryIcons: Record<string, string> = {
    'LLM Chat':    'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'AI Agents':   'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Vision':      'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Audio':       'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'TTS':         'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Music':       'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Coding':      'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Image Gen':   'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Uncensored':  'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
    'Special Request': 'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
  };

  // Group apps by category (multi-category supported)
  const apps = catalog.summaries as Record<string, { id: string; name: string }>;
  const details = catalog.details as Record<string, { categories?: string[] }>;
  const byCategory: Record<string, string[]> = {};
  for (const [id, d] of Object.entries(details)) {
    const cats = (d.categories || []) as string[];
    for (const c of cats) {
      if (!byCategory[c]) byCategory[c] = [];
      byCategory[c].push(id);
    }
  }

  const cats = (catalog.categories || []) as string[];
  const pages: Record<string, { category: string; content: string }> = {};
  const topicLists: Record<string, { name: string; type: string; content: string; title: Record<string, string> }> = {};
  const tags: Record<string, unknown> = {};

  cats.forEach((cat, i) => {
    const topicName = `Featured apps in ${cat}`;
    pages[cat] = {
      category: cat,
      content: JSON.stringify([
        { type: 'Topic', id: topicName },
        { type: 'Default Topic', id: 'Newest' },
      ]),
      source: 0,
      updated_at: now,
      createdAt: '2025-11-07T05:14:01.765Z',
    };
    topicLists[topicName] = {
      name: topicName,
      type: 'Category',
      content: (byCategory[cat] || []).join(','),
      title: { 'en-US': topicName, 'zh-CN': topicName },
      source: 0,
      updated_at: now,
      createdAt: '2025-11-07T05:14:01.765Z',
    };
    tags[cat] = {
      _id: `cat_${cat.toLowerCase().replace(/\s+/g, '_')}`,
      name: cat,
      title: { 'en-US': cat, 'zh-CN': cat },
      icon: categoryIcons[cat] || 'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg',
      sort: 10 + i,
      source: 0,
      updated_at: now,
      createdAt: '2025-11-07T05:14:01.765Z',
    };
  });

  return json({
    version,
    hash: catalog.hash,
    last_updated: now,
    data: {
      apps,
      recommends: {},
      pages,
      topics: {},
      topic_lists: topicLists,
      tops: (catalog as { tops?: unknown[] }).tops || [],
      latest: catalog.latest,
      tags,
    },
    stats: {
      appstore_data: {
        apps: Object.keys(apps).length,
        pages: Object.keys(pages).length,
        recommends: 0,
        tags: Object.keys(tags).length,
        topic_lists: Object.keys(topicLists).length,
        topics: 0,
      },
      last_updated: now,
    },
  });
}

// POST /api/v1/applications/info
async function handleDetail(request: Request): Promise<Response> {
  const body = (await request.json()) as { app_ids: string[]; version: string };
  const version = body.version || '1.12.3';
  const apps: Record<string, unknown> = {};
  const notFound: string[] = [];

  const details = catalog.details as Record<string, unknown>;

  for (const id of body.app_ids || []) {
    if (details[id]) {
      apps[id] = details[id];
    } else {
      notFound.push(id);
    }
  }

  return json({
    apps,
    version,
    ...(notFound.length > 0 ? { not_found: notFound } : {}),
  });
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/v1/appstore/hash' && request.method === 'GET') {
      return handleHash(url);
    }

    if (path === '/api/v1/appstore/info' && request.method === 'GET') {
      return handleInfo(url);
    }

    if (path === '/api/v1/applications/info' && request.method === 'POST') {
      return handleDetail(request);
    }

    // Serve charts: /api/v1/applications/{app_name}/chart?fileName=xxx.tgz
    const chartMatch = path.match(/^\/api\/v1\/applications\/(.+)\/chart$/);
    if (chartMatch && request.method === 'GET') {
      const fileName = url.searchParams.get('fileName') || chartMatch[1];
      const data = (charts as Record<string, string>)[fileName];
      if (data) {
        const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        return new Response(binary, {
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return json({ error: 'Chart not found' }, 404);
    }

    // /icons/ and /screenshots/ are served by Cloudflare Static Assets (see wrangler.toml [assets])

    // Health check
    if (path === '/' || path === '/health') {
      return json({
        name: 'orales-one-market',
        status: 'ok',
        apps: Object.keys(catalog.summaries).length,
      });
    }

    return json({ error: 'Not Found' }, 404);
  },
} satisfies ExportedHandler<Env>;
