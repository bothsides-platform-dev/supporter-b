'use client';

import { useState, useTransition } from 'react';
import { loginAction } from './actions';

export default function AdminLoginPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginAction({
        adminId: fd.get('adminId') as string,
        password: fd.get('password') as string,
      });
      if (result && !result.ok) setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded border border-outline-variant bg-surface p-6">
        <h1 className="text-title-large font-semibold">Admin 로그인</h1>
        <div>
          <label htmlFor="adminId" className="text-label-medium">아이디</label>
          <input id="adminId" name="adminId" autoComplete="username" required
            className="mt-1 w-full rounded border border-outline px-3 py-2 text-body-medium bg-surface-container outline-none focus:border-primary" />
        </div>
        <div>
          <label htmlFor="adminPassword" className="text-label-medium">비밀번호</label>
          <input id="adminPassword" name="password" type="password" autoComplete="current-password" required
            className="mt-1 w-full rounded border border-outline px-3 py-2 text-body-medium bg-surface-container outline-none focus:border-primary" />
        </div>
        {error && <p className="text-body-small text-error">{error}</p>}
        <button type="submit" disabled={isPending}
          className="w-full rounded bg-primary px-4 py-2 text-label-large text-on-primary disabled:opacity-50">
          {isPending ? 'LOADING…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
