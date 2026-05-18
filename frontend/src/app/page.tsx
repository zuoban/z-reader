'use client';

import Link from 'next/link';
import { BookOpen, Upload, Cloud, Palette, Bookmark, Smartphone, Server, MoveRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  const { isLoading, isAuthenticated } = useAuth({ redirectOnExpire: false });

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-gray-100 dark:bg-[#0a0a0a] dark:text-white">
      
      {/* ── Navigation ── */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8 md:px-12">
        <div className="flex items-center gap-2">
          <BookOpen size={24} strokeWidth={2} />
          <span className="text-xl font-bold tracking-tight">ZReader</span>
        </div>
        <nav>
          <Link 
            href={!isLoading && isAuthenticated ? "/shelf" : "/login"}
            className="text-sm font-semibold hover:opacity-70 transition-opacity"
          >
            登录
          </Link>
        </nav>
      </header>

      {/* ── Hero Section ── */}
      <section className="mx-auto max-w-7xl px-6 py-20 text-center md:px-12 md:py-32">
        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-[1.1]">
          您的个人书库，<br />极简之美
        </h1>
        <p className="mx-auto mt-8 max-w-2xl text-lg text-gray-500 dark:text-gray-400 md:text-xl leading-relaxed">
          一款轻量级、自托管的 EPUB 阅读器，专为沉浸式阅读而设计。<br className="hidden md:block" />
          上传书籍，随处阅读，并保持进度同步。
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href={!isLoading && isAuthenticated ? "/shelf" : "/login"}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[#050509] px-8 text-base font-bold text-white transition-all hover:bg-black active:scale-[0.98] dark:bg-white dark:text-black"
          >
            立即开始
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-200 px-8 text-base font-bold transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-gray-800 dark:hover:bg-gray-900"
          >
            登录
          </Link>
        </div>
      </section>

      {/* ── Product Preview ── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 md:px-12">
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 p-2 shadow-2xl dark:border-gray-800/50 dark:bg-gray-900/20">
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#0a0a0a]">
            {/* Browser Header Overlay */}
            <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-800" />
              <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-800" />
              <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-800" />
            </div>
            {/* Mock Library Content */}
            <div className="p-8 md:p-12">
              <div className="mb-8 text-lg font-bold">我的书库</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-lg bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-px w-full bg-gray-100 dark:bg-gray-900" />

      {/* ── Features Section ── */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center md:px-12 md:py-32">
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          您阅读所需的一切
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-gray-500 dark:text-gray-400">
          为重视简约、隐私和对数字图书馆拥有掌控权的读者而打造
        </p>

        <div className="mt-20 grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-3">
          <FeatureItem 
            icon={<Upload size={20} />}
            title="您的图书馆，您的书籍"
            description="在一处集中上传并整理您的 EPUB 收藏。"
          />
          <FeatureItem 
            icon={<Cloud size={20} />}
            title="多设备同步"
            description="阅读进度自动保存，随时随地无缝续读。"
          />
          <FeatureItem 
            icon={<Palette size={20} />}
            title="专注阅读"
            description="极简界面配以可定制的主题，带来舒适的阅读体验。"
          />
          <FeatureItem 
            icon={<Bookmark size={20} />}
            title="智能书签"
            description="标记您喜爱的片段，随时轻松回顾。"
          />
          <FeatureItem 
            icon={<Smartphone size={20} />}
            title="多平台适配"
            description="适配桌面、平板和移动设备的响应式设计。"
          />
          <FeatureItem 
            icon={<Server size={20} />}
            title="私有化部署"
            description="部署在您自己的服务器上，完全掌控您的数据隐私。"
          />
        </div>
      </section>

      <div className="h-px w-full bg-gray-100 dark:bg-gray-900" />

      {/* ── CTA Section ── */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center md:px-12 md:py-32">
        <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">
          今天就开始阅读
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
          几分钟内即可创建您的账号并建立您的个人数字图书馆。
        </p>
        <div className="mt-10">
          <Link
            href={!isLoading && isAuthenticated ? "/shelf" : "/login"}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[#050509] px-10 text-base font-bold text-white transition-all hover:bg-black active:scale-[0.98] dark:bg-white dark:text-black"
          >
            免费开始使用
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-12 dark:border-gray-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row md:px-12">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <BookOpen size={16} />
            <span>ZReader · 一款轻量级 EPUB 阅读器</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <span>开源</span>
            <span className="h-1 w-1 rounded-full bg-gray-200 dark:bg-gray-800" />
            <span>自托管</span>
            <span className="h-1 w-1 rounded-full bg-gray-200 dark:bg-gray-800" />
            <span>隐私保护</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center md:items-start md:text-left">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {icon}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
