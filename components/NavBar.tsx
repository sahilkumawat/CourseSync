'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function NavBar() {
  const { data: session } = useSession();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-blue-600">
              CourseSync
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            {session ? (
              <>
                <span className="text-sm text-gray-700">{session.user?.email}</span>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  Sign Out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}

