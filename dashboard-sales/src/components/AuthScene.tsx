import { useEffect, useRef, type ReactNode } from 'react';
import { mountStarfield } from '../../../starfield.js';
import wordmark from '../../../logoadereso.webp';

/** Public visual assets only; the private Hub still lives behind AuthGate/MfaGate. */
export function AuthScene({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => canvas.current ? mountStarfield(canvas.current) : undefined, []);
  return <main className="auth-scene">
    <canvas ref={canvas} className="auth-scene-sky" aria-hidden="true" />
    <div className="auth-scene-content">
      <img className="auth-scene-logo" src={wordmark} width={566} height={113} alt="Adereso" />
      {children}
    </div>
  </main>;
}
