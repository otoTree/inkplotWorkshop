import { requireAdmin } from '@/lib/admin/auth';
import Link from 'next/link';

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-serif">管理后台</h1>
        <nav className="space-x-4">
          <Link href="/admin/redis" className="text-sm text-gray-600 hover:text-black">并发队列管理</Link>
          <Link href="/admin/projects" className="text-sm text-gray-600 hover:text-black">全站项目</Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-black">返回前台</Link>
        </nav>
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
