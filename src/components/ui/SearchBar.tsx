import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (value: string) => void;
  initialValue?: string;
  size?: 'md' | 'lg';
}

export default function SearchBar({ placeholder = 'Search...', onSearch, initialValue = '', size = 'md' }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  /**
   * Follow `initialValue` when the *caller* changes it — a `?q=` in the URL, browser
   * back/forward, a link into an already-open search page. Typing does not change this
   * prop, so this never fights the user mid-keystroke.
   */
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value);
      }}
      className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-ieee-orange focus-within:ring-2 focus-within:ring-ieee-orange/20"
      role="search"
    >
      <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
        placeholder={placeholder}
        className={`w-full bg-transparent outline-none placeholder:text-slate-400 ${
          size === 'lg' ? 'py-4 text-lg' : 'py-2.5 text-sm'
        }`}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            onSearch('');
          }}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
