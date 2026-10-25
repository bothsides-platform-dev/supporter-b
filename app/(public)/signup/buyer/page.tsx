'use client';
import { Suspense } from 'react';
import { BuyerSignupEmailForm } from '@/components/auth/BuyerSignupEmailForm';
export default function BuyerSignupEmailPage() { return <Suspense fallback={<p>불러오는 중이에요…</p>}><BuyerSignupEmailForm /></Suspense>; }
