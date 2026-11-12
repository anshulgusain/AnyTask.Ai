import Link from 'next/link';

export default function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        <span className="wordmark-mark">A</span>
        AnyTask <span className="wordmark-sub">QA agent</span>
      </Link>
      {children}
    </header>
  );
}
