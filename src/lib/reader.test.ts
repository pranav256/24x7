import { beforeEach, describe, expect, it, vi } from 'vitest'
import { categories, filterArticles, parseArticle, parseFeed } from './feed'
import { cachedFeed, mergeLibrary, parseLibrary, preferences, writeStorage } from './library'
import { readerLocation, readerSearch } from './navigation'

const raw = { title: 'A story [with punctuation]', description: null, url: 'https://example.com/story', urlToImage: null, source: { name: 'Example News' }, publishedAt: '2026-10-05T06:00:00Z' }
const article = parseArticle(raw)!
const saved = { article, savedAt: '2026-10-05T07:00:00.000Z', read: false }

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('feed contracts', () => {
  it('keeps readable stories without optional images and descriptions', () => {
    const result = parseFeed({ articles: [raw, raw, null, { ...raw, url: 'javascript:alert(1)' }] })
    expect(result.articles).toHaveLength(1)
    expect(result.articles[0].urlToImage).toBeNull()
    expect(result.fetchedAt).toBeNull()
  })
  it.each([
    ['description', { description: { toString: null } }],
    ['author', { author: { toString: null } }],
    ['content', { content: { toString: null } }],
    ['image URL', { urlToImage: { toString: null } }],
    ['source name', { source: { name: { toString: null } } }],
  ])('ignores malformed %s metadata without rejecting the edition', (_field, metadata) => {
    const payload = { articles: [{ ...raw, ...metadata }, { ...raw, url: 'https://example.com/other' }] }
    expect(() => parseFeed(payload)).not.toThrow()
    expect(parseFeed(payload).articles.map((item) => item.url)).toEqual([raw.url, 'https://example.com/other'])
  })
  it('still excludes matching topics in valid string metadata', () => {
    for (const metadata of [
      { description: 'Artificial intelligence news' },
      { author: 'Artificial intelligence reporter' },
      { content: 'Artificial intelligence news' },
      { urlToImage: 'https://example.com/ai/image.jpg' },
      { source: { name: 'Artificial intelligence daily' } },
    ]) {
      expect(parseArticle({ ...raw, ...metadata })).toBeNull()
    }
  })
  it('distinguishes an empty valid feed from a malformed or failed response', () => {
    expect(parseFeed({ articles: [] }).articles).toEqual([])
    expect(() => parseFeed({ articles: 'bad' })).toThrow()
    expect(() => parseFeed({ status: 'error', articles: [] })).toThrow()
    expect(parseFeed({ articles: [{ title: 'No URL' }] }).articles).toEqual([])
  })
  it('treats search punctuation literally and does not mutate the source list', () => {
    const list = [article, { ...article, id: 'other', title: 'Another story', source: { id: null, name: 'Other News' } }]
    expect(filterArticles(list, '[', '', 'newest')).toEqual([article])
    expect(filterArticles(list, '', '', 'newest')).toHaveLength(2)
    expect(filterArticles(list, '', 'Other News', 'newest')[0].title).toBe('Another story')
    expect(list).toHaveLength(2)
  })
  it('bounds untrusted provider metadata and keeps equal-date ordering stable', () => {
    const providers = Array.from({ length: 40 }, (_, index) => `provider-${index}`)
    const result = parseFeed({ articles: [{ ...raw, url: 'https://example.com/b' }, { ...raw, url: 'https://example.com/a' }], providers })
    expect(result.providers).toHaveLength(20)
    expect(filterArticles(result.articles, '', '', 'newest').map((item) => item.id)).toEqual(['https://example.com/a', 'https://example.com/b'])
  })
  it('accepts a full 500-story edition and restores it from cache with the same bound', () => {
    const articles = Array.from({ length: 501 }, (_, index) => ({ ...raw, url: `https://example.com/report-${index}` }))
    const feed = parseFeed({ articles })
    expect(feed.articles).toHaveLength(500)
    expect(cachedFeed(JSON.stringify(feed))?.articles).toHaveLength(500)
    expect(cachedFeed(JSON.stringify({ ...feed, articles }))).toBeNull()
  })
})
describe('local reading data', () => {
  it('recovers from corrupt and unsupported preferences', () => {
    expect(preferences('{')).toEqual({ country: 'in', category: 'general', theme: 'light' })
    expect(preferences(JSON.stringify({ country: 'zz', category: 'invalid', theme: 'dark' }))).toEqual({ country: 'in', category: categories[0], theme: 'dark' })
  })
  it('round-trips an export and keeps existing read state on duplicate imports', () => {
    const imported = parseLibrary(JSON.stringify({ version: 1, articles: [saved] }), true)
    expect(imported).toEqual([saved])
    expect(mergeLibrary([{ ...saved, read: true }], imported)[0].read).toBe(true)
  })
  it('rejects hostile or partial imports instead of silently discarding records', () => {
    expect(() => parseLibrary(JSON.stringify({ version: 1, articles: [saved, { ...saved, article: { ...raw, url: 'data:text/html,bad' } }] }), true)).toThrow()
    expect(parseLibrary('broken local data')).toEqual([])
  })
  it('reports storage failures and validates cached feeds', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(writeStorage('queue', [saved])).toBe(false)
    expect(cachedFeed('{')).toBeNull()
    expect(cachedFeed(JSON.stringify({ articles: [raw], fetchedAt: null, providers: [] }))?.articles).toEqual([article])
  })
  it('rejects inherited country names and restores URL filters without fabricated state', () => {
    const defaults = preferences(null)
    expect(preferences('{"country":"constructor"}').country).toBe('in')
    const location = readerLocation('?country=us&category=science&q=%5B&source=Example&order=oldest&view=saved&read=unread', defaults)
    expect(readerLocation(readerSearch(location), defaults)).toEqual(location)
    expect(readerLocation('?country=__proto__&category=not-valid', defaults).country).toBe('in')
  })
})
