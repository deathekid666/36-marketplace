import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="air-logo" aria-label="36 home">
      <span className="air-logo-mark">36</span>
      <span className="air-logo-word">studios</span>
    </Link>
  );
}
