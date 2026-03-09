"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type StudioNavItem = {
  label: string;
  detail: string;
  href?: string;
};

type StudioNavProps = {
  items: StudioNavItem[];
};

export function StudioNav({ items }: StudioNavProps) {
  const pathname = usePathname();

  return (
    <nav className="studio-nav" aria-label="Primary">
      {items.map((item) => {
        if (!item.href) {
          return (
            <div className="studio-nav-item is-upcoming" key={item.label}>
              <span className="studio-nav-kicker">{item.detail}</span>
              <strong>{item.label}</strong>
              <span className="studio-nav-tag">Soon</span>
            </div>
          );
        }

        const isActive = pathname === item.href;

        return (
          <Link
            className={`studio-nav-item ${isActive ? "is-active" : ""}`}
            href={item.href}
            key={item.label}
          >
            <span className="studio-nav-kicker">{item.detail}</span>
            <strong>{item.label}</strong>
          </Link>
        );
      })}
    </nav>
  );
}
