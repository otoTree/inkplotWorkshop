'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AuthCodeErrorPage() {
  const [error, setError] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  useEffect(() => {
    // Supabase error parameters are often appended as a hash fragment or search params
    const hash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    const errorCode = hashParams.get('error_code') || hashParams.get('error') || searchParams.get('error_code') || searchParams.get('error');
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

    if (errorCode || errorDesc) {
      setError(errorCode || 'unknown_error');
      setDescription(errorDesc || 'The authentication link is invalid or has expired.');
    } else {
      setError('auth_error');
      setDescription('The authentication link is invalid or has expired. Please request a new link.');
    }
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#FAFAF9] p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-stone-200/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-stone-200/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 flex flex-col gap-8 items-center text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-serif font-medium tracking-tight text-black/90">
            Authentication Error
          </h1>
          <p className="text-sm text-black/40 tracking-widest uppercase font-light">
            {error.replace(/_/g, ' ')}
          </p>
        </div>

        <div className="p-6 bg-white/50 backdrop-blur-sm border border-black/[0.04] rounded-2xl w-full flex flex-col gap-6">
          <div className="text-sm text-black/70 font-light leading-relaxed">
            {description}
          </div>

          <Link
            href="/login"
            className="w-full inline-flex justify-center items-center h-10 px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-black/80 transition-colors"
          >
            Back to Login
          </Link>
        </div>

        <footer className="text-center text-xs text-black/20 font-light">
          © {new Date().getFullYear()} Inkplot Workshop. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
