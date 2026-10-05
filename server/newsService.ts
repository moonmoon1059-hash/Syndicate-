export interface RawNewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: number;
  summary: string;
  tags?: string[];
}

const newsCache: { articles: RawNewsArticle[]; timestamp: number } = {
  articles: [],
  timestamp: 0
};

/**
 * Strips HTML tags and unescapes common XML entities
 */
function cleanXmlText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses items from an RSS 2.0 XML string
 */
function parseRssFeed(xmlText: string, defaultSource: string): RawNewsArticle[] {
  const articles: RawNewsArticle[] = [];
  const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches.slice(0, 15)) {
    const titleMatch = itemXml.match(/<title>(.*?)<\/title>/is);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/is);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/is);
    const descMatch = itemXml.match(/<description>(.*?)<\/description>/is);

    const title = cleanXmlText(titleMatch ? titleMatch[1] : '');
    const url = cleanXmlText(linkMatch ? linkMatch[1] : '');
    const pubDateStr = cleanXmlText(pubDateMatch ? pubDateMatch[1] : '');
    const summary = cleanXmlText(descMatch ? descMatch[1] : '').slice(0, 260);

    const publishedAt = pubDateStr ? Date.parse(pubDateStr) || Date.now() : Date.now();

    if (title && url) {
      articles.push({
        id: `news_${Math.abs(url.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0))}`,
        title,
        source: defaultSource,
        url,
        publishedAt,
        summary: summary ? `${summary}...` : title,
        tags: []
      });
    }
  }

  return articles;
}

export async function fetchCryptoNews(): Promise<RawNewsArticle[]> {
  if (newsCache.articles.length > 0 && Date.now() - newsCache.timestamp < 60000) {
    return newsCache.articles;
  }
  
  try {
    // 1. Try real-time Cointelegraph RSS feed
    const ctRes = await fetch('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MoonScanner/1.0)' },
      signal: AbortSignal.timeout(4000)
    });
    if (ctRes.ok) {
      const xml = await ctRes.text();
      const articles = parseRssFeed(xml, 'Cointelegraph');
      if (articles.length > 0) {
        newsCache.articles = articles;
        newsCache.timestamp = Date.now();
        return articles;
      }
    }
  } catch (err) {
    // Cointelegraph feed failover
  }

  try {
    // 2. Try Decrypt RSS feed
    const decryptRes = await fetch('https://decrypt.co/feed', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MoonScanner/1.0)' },
      signal: AbortSignal.timeout(4000)
    });
    if (decryptRes.ok) {
      const xml = await decryptRes.text();
      const articles = parseRssFeed(xml, 'Decrypt');
      if (articles.length > 0) {
        newsCache.articles = articles;
        newsCache.timestamp = Date.now();
        return articles;
      }
    }
  } catch (err) {
    // Decrypt feed failover
  }
  
  // Real data invariant: Return previous valid cache if present, else empty array. Zero synthetic fallback news.
  if (newsCache.articles.length > 0) {
    return newsCache.articles;
  }

  return [];
}
