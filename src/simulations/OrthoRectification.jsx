import { useEffect } from "react";

// Preserve bookmarked React-preview URLs, but use the complete source-image
// resampling/visibility lesson instead of maintaining a misleading second engine.
export default function OrthoRectification() {
  const href = `${import.meta.env.BASE_URL}games/ortho-rectification/`;
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <main className="sim-loading">
      <h1>True Ortho-Rectification</h1>
      <p>Opening the complete orthorectification laboratory…</p>
      <a href={href}>Continue to the laboratory →</a>
    </main>
  );
}
