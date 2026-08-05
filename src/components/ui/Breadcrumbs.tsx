import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Crumb {
  label: string;
  to?: string;
  icon?: LucideIcon;
}

interface BreadcrumbsProps {
  items: Crumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-[#4A5568] mb-4" aria-label="Breadcrumb">
      <Link to="/" className="flex items-center hover:text-[#1A1A1A] transition-colors">
        <Home size={14} />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const Icon = item.icon;
        return (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-[#9CA3AF]" />
            {item.to && !isLast ? (
              <Link to={item.to} className="hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                {Icon && <Icon size={14} />}
                {item.label}
              </Link>
            ) : (
              <span className={`flex items-center gap-1 ${isLast ? 'text-[#1A1A1A] font-medium' : ''}`}>
                {Icon && <Icon size={14} />}
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
