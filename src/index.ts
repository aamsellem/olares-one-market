import catalog from './catalog.json';
import charts from './charts.json';

interface Env {}

// The source id the device registered this market under. Echoed back on the v2
// catalog probe; a caller-supplied source_id wins so a differently-named
// registration still matches.
const SOURCE_ID = 'market.aamsellem';

const OLARES_CONSTRAINT = '>=1.12.6-0';
const DEFAULT_OLARES_VERSION = '1.12.6';

const CATEGORY_ICON = 'https://app.cdn.olares.com/icons/market/sidebar/neurology.svg';

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
  const version = url.searchParams.get('version') || DEFAULT_OLARES_VERSION;
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
  const version = url.searchParams.get('version') || DEFAULT_OLARES_VERSION;
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

// GET /api/v2/catalog
// Step 1 of the Olares 1.12.7+ sync is a cheap "has anything changed?" probe.
// It has NO v1 equivalent, so a 404 here aborts the whole source sync — every
// later step (including the v1 data/detail fetches) is skipped, which is why
// published chart bumps stopped reaching devices entirely.
//
// `apps_filter_digest` maps onto our content-addressed catalog hash, so the
// device refetches exactly when the catalog content actually changed.
function handleCatalogV2(url: URL): Response {
  const stamp = (catalog as { generated_at?: number }).generated_at || 0;
  return json({
    code: 0,
    msg: 'success',
    data: {
      schema_version: 'v2',
      source_id: url.searchParams.get('source_id') || SOURCE_ID,
      taxonomy_last_modify_time: stamp,
      apps_last_modify_time: stamp,
      apps_filter_digest: catalog.hash,
    },
  });
}

// GET /api/v2/taxonomy
// Step 2 of the v2 sync. Supersedes the category/tag half of /appstore/info:
// the v1 response nested these as keyed objects, v2 wants flat arrays with
// per-locale title maps. Content is the same category set, reshaped.
function handleTaxonomyV2(): Response {
  const stamp = (catalog as { generated_at?: number }).generated_at || 0;
  const cats = (catalog.categories || []) as string[];

  const categories = cats.map((cat, i) => ({
    id: cat,
    builtin: false,
    sort: 10 + i,
    icon: CATEGORY_ICON,
    title: { 'en-US': cat, 'zh-CN': cat },
    description: {},
  }));

  return json({
    code: 0,
    msg: 'success',
    data: {
      last_modify_time: stamp,
      source: {
        source_id: SOURCE_ID,
        short_label: 'Olares One',
        display_name: { 'en-US': 'Olares One', 'fr-FR': 'Olares One', 'zh-CN': 'Olares One' },
        icon: CATEGORY_ICON,
        is_official: false,
      },
      languages: [
        { code: 'en-US', display_name: 'English', sort: 1, enabled: true },
        { code: 'zh-CN', display_name: '简体中文', sort: 2, enabled: true },
      ],
      categories,
      nav: cats,
      // Every category lists all of its apps; we run no curated topics.
      pages: cats.map((cat) => ({ category_id: cat, items: [{ id: 'all', type: 'all' }] })),
      tags: [],
      topic_lists: [],
      topics: [],
      recommends: [],
    },
  });
}

// GET /api/v2/applications
// Step 3 of the v2 sync: the app list. This is the summary tier — the device
// still pulls full entries from the v1 POST /applications/info afterwards
// (API_DETAIL_PATH is deliberately left on v1 in the Olares deployment).
//
// `last_modify_time` is per-app in the schema, but our catalog only tracks a
// single content stamp, so every app carries it. That is correct-but-coarse:
// the device refetches all details whenever any app changed. With 43 apps the
// extra work is negligible, and it can never miss a change.
function handleApplicationsV2(url: URL): Response {
  const stamp = (catalog as { generated_at?: number }).generated_at || 0;
  const details = catalog.details as Record<string, Record<string, unknown>>;

  const all = Object.values(details).map((d) => ({
    app_id: d.id,
    name: d.name,
    title: d.title,
    version: d.version,
    icon: d.icon,
    featured_image: d.featuredImage ?? '',
    cfg_type: d.cfgType ?? 'app',
    categories: d.categories ?? [],
    categories_v2: d.categories ?? [],
    tags: d.tags ?? [],
    app_labels: [],
    olares_version_constraint: OLARES_CONSTRAINT,
    // Mind the units: v2 wants `last_modify_time` in epoch MILLIseconds and
    // `updated_at` in epoch SECONDS (both int64). v1 sent updated_at as an ISO
    // string, which the Go decoder rejects outright.
    last_modify_time: stamp,
    updated_at: Math.floor(stamp / 1000),
  }));

  // Paginate only when asked; an absent `size` means "give me everything".
  const size = parseInt(url.searchParams.get('size') || '0', 10);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const items = size > 0 ? all.slice((page - 1) * size, page * size) : all;

  return json({
    code: 0,
    msg: 'success',
    data: {
      items,
      // We never tombstone apps: a chart removed from the repo simply stops
      // being published. Nothing to report as explicitly removed.
      removed: [],
      has_more: size > 0 ? page * size < all.length : false,
      max_last_modify_time: stamp,
      total: all.length,
      page,
      page_size: size > 0 ? size : all.length,
    },
  });
}

// POST /api/v1/applications/info
async function handleDetail(request: Request): Promise<Response> {
  const body = (await request.json()) as { app_ids: string[]; version: string };
  const version = body.version || DEFAULT_OLARES_VERSION;
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
    // Olares 1.12.7+ fetches charts via /api/v2/... and only falls back to /api/v1
    // on a 404 (beclab/Olares PR #3958, merged 2026-08-19). Accept both prefixes so
    // we answer on the first try, and keep working if the v1 fallback is ever dropped.
    const path = url.pathname.replace(/^\/api\/v2\//, '/api/v1/');

    if (url.pathname === '/api/v2/catalog' && request.method === 'GET') {
      return handleCatalogV2(url);
    }

    if (url.pathname === '/api/v2/taxonomy' && request.method === 'GET') {
      return handleTaxonomyV2();
    }

    // /browse/applications is the SPA's paginated view; same rows, so it shares
    // the handler. Must be tested before /applications — the chart route below
    // would otherwise swallow it.
    if (
      (url.pathname === '/api/v2/applications' || url.pathname === '/api/v2/browse/applications') &&
      request.method === 'GET'
    ) {
      return handleApplicationsV2(url);
    }

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
