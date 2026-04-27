// src/components/SplitText.tsx – free alternative, no Club GSAP required
import { useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface SplitTextProps {
  text: string;
  tag?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  delay?: number;          // delay between each character (ms)
  duration?: number;       // animation duration (s)
  from?: { opacity?: number; y?: number };
  to?: { opacity?: number; y?: number };
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'center' | 'right';
}

const SplitText = ({
  text,
  tag: Tag = 'span',
  className = '',
  delay = 30,
  duration = 0.5,
  from = { opacity: 0, y: 30 },
  to = { opacity: 1, y: 0 },
  threshold = 0.2,
  rootMargin = '-50px',
  textAlign = 'left',
}: SplitTextProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: rootMargin, amount: threshold });
  const characters = text.split('');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: delay / 1000 },
    },
  };

  const childVariants = {
    hidden: from,
    visible: { ...to, transition: { duration } },
  };

  return (
    <Tag
      ref={ref}
      className={`inline-block ${className}`}
      style={{ textAlign }}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        style={{ display: 'inline-block' }}
      >
        {characters.map((char, i) => (
          <motion.span
            key={i}
            variants={childVariants}
            style={{ display: 'inline-block' }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </motion.div>
    </Tag>
  );
};

export default SplitText;