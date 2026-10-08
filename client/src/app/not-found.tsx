import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page p-6 text-center">
      <h1 className="text-3xl font-bold text-primary">404</h1>
      <p className="text-text">Page not found.</p>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">Go to Dashboard</Link>
    </div>
  );
}
