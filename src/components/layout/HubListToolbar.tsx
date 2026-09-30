import type { ReactNode } from 'react';
import { SearchBar } from '../ui/SearchBar';

export function HubListToolbar({
  search,
  onSearch,
  placeholder,
  filters,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  filters?: ReactNode;
}) {
  return (
    <div className="hub-list-toolbar">
      {filters}
      <SearchBar value={search} onChange={onSearch} placeholder={placeholder} className="hub-list-toolbar-search" />
    </div>
  );
}
