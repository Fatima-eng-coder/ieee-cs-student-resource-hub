import type { ReactNode } from 'react';
import { getSafeDownloadAttribute, hasFile } from '@/utils/files';

interface DownloadButtonProps {
  url?: string;
  filename?: string;
  label: string;
  icon?: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Downloads the file when one is actually uploaded; otherwise renders a clearly
 * disabled control so no button ever points to nothing.
 */
export default function DownloadButton({ url, filename, label, icon, className = '', onClick }: DownloadButtonProps) {
  if (hasFile(url)) {
    const href = url!.trim();
    const download = getSafeDownloadAttribute(href, filename);

    return (
      <a
        href={href}
        download={download}
        target="_blank"
        rel="noreferrer"
        data-cursor="link"
        onClick={onClick}
        className={className}
      >
        {icon}
        {label}
      </a>
    );
  }
  return (
    <span
      aria-disabled="true"
      title="Not uploaded yet"
      className={`${className} pointer-events-none cursor-not-allowed opacity-50`}
    >
      {icon}
      {label}
      <span className="ml-1 text-[11px] font-normal opacity-80">· not uploaded</span>
    </span>
  );
}
