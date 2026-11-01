/**
 * openaiRss — OpenAI's news feed, the channel OpenAlex does not carry
 * (doc 187 §2.2). Measured on 2026-10-28: 1 333 posts since 2015-12-11, 76 in
 * the last 30 days, 11 of them in a research category. The feed mixes
 * research with products and company news, so the screen folds the rest away.
 *
 *  - each `<item>` has a `<guid>` (the post's URL), a CDATA title, a short
 *    description (about 150 characters), categories and a `pubDate`;
 *  - no PDF or arXiv link in any of the 237 research posts;
 *  - the post pages answer 403 to a plain fetch: only the feed is read here.
 */

/** The categories whose posts are research (doc 187 §2.2). */
export const RESEARCH_CATEGORIES: readonly string[] = ['Research', 'Publication', 'Safety', 'Safety & Alignment'];

export interface Post {
  /** The `<guid>`, which is what the host's watch keeps as the id. */
  id: string;
  title: string;
  url: string;
  /** `2026-10-26`. */
  published?: string;
  categories: string[];
  description?: string;
}

const tidy = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function child(el: Element, name: string): string {
  return tidy(Array.from(el.children).find((c) => c.localName === name)?.textContent);
}

/** `Mon, 26 Oct 2026 10:00:00 GMT` → `2026-10-26` (UTC); undefined when unreadable. */
export function rssDay(pubDate: string): string | undefined {
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

export function parseRss(xml: string): Post[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('RSS_XML_UNREADABLE');
  const items = Array.from(doc.getElementsByTagName('item'));
  if (items.length === 0 && doc.documentElement.localName !== 'rss') throw new Error('RSS_NOT_A_FEED');
  const out: Post[] = [];
  for (const item of items) {
    const title = child(item, 'title');
    const link = child(item, 'link');
    const id = child(item, 'guid') || link;
    if (!id || !title) continue;
    const categories = Array.from(item.children).filter((c) => c.localName === 'category').map((c) => tidy(c.textContent)).filter(Boolean);
    const published = rssDay(child(item, 'pubDate'));
    const description = child(item, 'description');
    out.push({
      id, title, url: link || id, categories,
      ...(published ? { published } : {}),
      ...(description ? { description } : {}),
    });
  }
  return out;
}

export function isResearch(post: Pick<Post, 'categories'>): boolean {
  return post.categories.some((c) => RESEARCH_CATEGORIES.includes(c));
}
