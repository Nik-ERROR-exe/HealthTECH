import React, { useEffect, useState, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnimatedThemeTogglerProps {
  className?: string;
}

export const AnimatedThemeToggler: React.FC<AnimatedThemeTogglerProps> = ({ className }) => {
  const [dark, setDark] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Initialize theme on documentElement on mount and sync state
  useEffect(() => {
    const initTheme = () => {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      setDark(document.documentElement.classList.contains('dark'));
    };

    initTheme();

    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextDark = !isCurrentlyDark;

    const applyThemeChange = () => {
      setDark(nextDark);
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    };

    // Fallback if View Transitions API is not supported or reduced motion is enabled
    if (
      typeof document === 'undefined' ||
      !('startViewTransition' in document) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      applyThemeChange();
      return;
    }

    // Determine circular clip-path center from click or button center
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (e && (e.clientX !== 0 || e.clientY !== 0)) {
      x = e.clientX;
      y = e.clientY;
    } else if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    document.documentElement.style.setProperty('--theme-x', `${x}px`);
    document.documentElement.style.setProperty('--theme-y', `${y}px`);
    document.documentElement.style.setProperty('--theme-r', `${endRadius}px`);

    // @ts-ignore - startViewTransition typing for browsers supporting it
    document.startViewTransition(() => {
      applyThemeChange();
    });
  };

  return (
    <button
      ref={buttonRef}
      onClick={toggleTheme}
      className={cn(
        'p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground focus:outline-none flex items-center justify-center',
        className
      )}
      aria-label="Toggle theme"
    >
      {dark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
};

export default AnimatedThemeToggler;
