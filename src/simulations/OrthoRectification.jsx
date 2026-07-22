import { useEffect, useRef } from 'react';
import legacyHtml from '../../games/ortho-rectification/index.html?raw';

// The renderer is mounted by React while its canvas engine is being split into
// hooks and modules. This keeps the migration behavior-identical: perspective
// projection, ray tracing, DSM/DTM rectification, occlusion filling, zoom/pan,
// and the concept quiz all remain active during the refactor.
export default function OrthoRectification() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const source = new DOMParser().parseFromString(legacyHtml, 'text/html');
    const style = document.createElement('style');
    style.textContent = source.querySelector('style')?.textContent || '';
    host.replaceChildren(style);

    const fragment = document.createRange().createContextualFragment(source.body.innerHTML);
    host.appendChild(fragment);
    const backLink = host.querySelector('.back-link');
    if (backLink) backLink.href = import.meta.env.BASE_URL;

    for (const originalScript of source.querySelectorAll('script')) {
      const script = document.createElement('script');
      script.textContent = originalScript.textContent;
      host.appendChild(script);
    }

    return () => host.replaceChildren();
  }, []);

  return <div className="react-simulation-host" ref={hostRef} />;
}
