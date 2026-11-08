import { type ReactNode, useEffect, useRef } from "react";

export function Title({ children }: { children: ReactNode }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <h1
      ref={title}
      tabIndex={-1}
      className="mb-6 text-3xl font-semibold tracking-tight break-words"
    >
      {children}
    </h1>
  );
}
