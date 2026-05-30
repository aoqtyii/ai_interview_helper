import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Panel } from '@/components/ui/panel';
import { demo, safeApi } from '@/lib/api';
import type { Article } from '@/lib/types';

export default async function IntelligencePage() {
  const articles = await safeApi<Article[]>('/intelligence/articles', demo.articles);

  return (
    <AppShell>
      <Panel>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">前沿 AI 技术情报</h2>
            <p className="text-sm text-slate-400">RSS/API 来源聚合，AI 自动生成中文摘要和岗位相关标签。</p>
          </div>
          <span className="rounded-md border border-cyan/40 px-2 py-1 text-xs text-cyan">Source-first</span>
        </div>
        <div className="grid gap-4">
          {articles.map((article) => (
            <article key={article.id} className="rounded-md border border-line bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">{article.source.name}</div>
                  <h3 className="mt-1 text-lg font-semibold">{article.title}</h3>
                </div>
                <Link href={article.url} className="rounded-md border border-line p-2 hover:border-cyan/50">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{article.digest?.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(article.digest?.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-md bg-acid/10 px-2 py-1 text-xs text-acid">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
