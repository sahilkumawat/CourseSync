'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import FileUpload from '@/components/FileUpload';
import type { ClassBlock } from '@/lib/types';

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <>
        <NavBar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </>
    );
  }

  if (!session) {
    return null;
  }

  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload image');
      }

      const data = await response.json();
      const classes: ClassBlock[] = data.classBlocks;

      // Store in sessionStorage and navigate to review page
      sessionStorage.setItem('parsedClasses', JSON.stringify(classes));
      router.push('/review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <>
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Schedule</h1>
        <div className="mb-6">
          <FileUpload onUpload={handleUpload} isLoading={isLoading} />
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        <div className="mt-8 text-sm text-gray-600">
          <p className="font-semibold mb-2">Tips for best results:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Use a clear, high-resolution screenshot</li>
            <li>Ensure the schedule shows all days of the week (Monday-Friday)</li>
            <li>Make sure time labels (e.g., &quot;10am&quot;, &quot;2:30pm&quot;) are visible</li>
            <li>The schedule should be in the standard weekly grid format</li>
          </ul>
        </div>
      </div>
    </>
  );
}

