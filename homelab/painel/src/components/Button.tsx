import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Kbd } from './Kbd';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  kbd?: string;
  children: ReactNode;
}

// Um único "primary" por área visível.
export function Button({ variant = 'quiet', size = 'md', kbd, children, className, type = 'button', ...resto }: Props) {
  return (
    <button type={type} className={`hm-btn hm-btn-${variant} hm-btn-${size}${className ? ` ${className}` : ''}`} {...resto}>
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}
