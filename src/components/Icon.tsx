import type { CSSProperties, ReactNode } from 'react';
import { ICONS } from '../lib/icon-paths';
import { useState } from 'react';

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Renders one of the original inline icon paths (no icon library added). */
export function Icon({ name, size = 18, className = '', style }: IconProps) {
  return (
    <svg
      className={`ic${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

interface ThumbSource {
  photo?: string;
  photoUrl?: string;
}

/**
 * Product thumbnail. Preserves the original behaviour of swapping a broken
 * remote image for the 📦 placeholder.
 */
export function Thumb({ source, className = 'p-thumb' }: { source?: ThumbSource; className?: string }) {
  const [failed, setFailed] = useState(false);
  const photo = source?.photoUrl || source?.photo || '📦';
  const isRemote = photo.startsWith('http') && !failed;
  if (isRemote) {
    return (
      <img
        className={className}
        src={photo}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  const content: ReactNode = photo.startsWith('http') ? '📦' : photo;
  return <span className={className}>{content}</span>;
}
