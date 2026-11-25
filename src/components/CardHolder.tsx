import { useEffect, useRef, useState } from 'react';
import CardItem from './CardItem';
import Spinner from './Spinner';
import { Button } from '@/components/ui/button';
import { type Article } from '@/lib/feed';
import { type SavedArticle } from '@/lib/library';
import { cn } from '@/lib/utils';

type Props = {
  articles: Article[];
  loading: boolean;
  error: string;
  cached: boolean;
  saved: SavedArticle[];
  onSave: (article: Article) => void;
  onRetry: () => void;
  onClear: () => void;
  filtered: boolean;
};
export default function CardHolder(props: Props) {
  const [limit, setLimit] = useState(12);
  const section = useRef<HTMLElement>(null);
  const focusAfterLoad = useRef<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = limit < props.articles.length;
  useEffect(() => {
    if (focusAfterLoad.current === null) return;
    section.current?.querySelectorAll<HTMLAnchorElement>('.story h3 a')[focusAfterLoad.current]?.focus();
    focusAfterLoad.current = null;
  }, [limit]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Let keyboard users finish with the controls before adding more stories.
      if (entry.isIntersecting && !element.contains(document.activeElement)) {
        setLimit((value) => Math.min(value + 12, props.articles.length));
      }
    }, { rootMargin: '240px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [limit, hasMore, props.articles.length]);
  const [lead, ...rest] = props.articles;
  const card = (article: Article, featured = false, compact = false) => (
    <CardItem
      key={article.id}
      article={article}
      featured={featured}
      compact={compact}
      saved={props.saved.some((item) => item.article.id === article.id)}
      onSave={props.onSave}
    />
  );
  return (
    <section ref={section} aria-label="Stories" aria-busy={props.loading}>
      {props.error && (
        <div className="reader-notice" role="alert">
          <p>
            {props.error} {props.cached && 'Your last loaded edition is still here.'}
          </p>
          <Button variant="outline" onClick={props.onRetry}>
            Retry refresh
          </Button>
        </div>
      )}
      {props.loading && !lead && <Spinner />}
      {!props.loading && !props.error && !lead && (
        <div className="reader-empty">
          <h3>{props.filtered ? 'No matching stories' : 'No stories in this edition'}</h3>
          <p>
            {props.filtered
              ? 'Try another search or remove your source filter.'
              : 'Try another section or refresh.'}
          </p>
          <Button onClick={props.filtered ? props.onClear : props.onRetry}>
            {props.filtered ? 'Clear search filters' : 'Refresh feed'}
          </Button>
        </div>
      )}
      {lead && (
        <>
          <div className={cn('cover-grid', { 'cover-grid-single': rest.length === 0 })}>
            {card(lead, true)}
            {rest.length > 0 && (
              <div className="cover-side">
                <div className="brief-heading">
                  <h2>In brief</h2>
                  <span aria-hidden="true">↘</span>
                </div>
                {rest.slice(0, 2).map((article) => card(article, false, true))}
              </div>
            )}
          </div>
          {rest.length > 2 && (
            <>
              <div className="more-heading">
                <h2>
                  The latest reports<span className="accent">.</span>
                </h2>
                <p>Scroll to keep reading</p>
              </div>
              <div className="story-grid">
                {rest.slice(2, limit - 1).map((article) => card(article))}
              </div>
            </>
          )}
          <div className="edition-end" ref={sentinel}>
            <p role="status" aria-live="polite" aria-atomic="true">
              Showing {Math.min(limit, props.articles.length)} of {props.articles.length} stories
            </p>
            {hasMore ? (
              <Button variant="outline" onClick={() => {
                focusAfterLoad.current = limit;
                setLimit((value) => value + 12);
              }}>
                Load more stories <span aria-hidden="true">↓</span>
              </Button>
            ) : (
              <span className="edition-complete">You’re up to date with this edition.</span>
            )}
            <a href="#main" className="text-link">
              Back to the top ↑
            </a>
          </div>
        </>
      )}
    </section>
  );
}
