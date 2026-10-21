import { THUMBNAILS } from "./thumbnail-catalog.js";

export default function SimulationThumbnail({ kind }) {
  const root = `${import.meta.env.BASE_URL}thumbnails/${kind}`;
  return (
    <img
      className="simulation-thumbnail"
      src={`${root}-480.webp`}
      srcSet={`${root}-480.webp 480w, ${root}-960.webp 960w`}
      sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1050px) 46vw, 410px"
      width="960"
      height="540"
      alt={THUMBNAILS[kind]}
      loading="lazy"
      decoding="async"
    />
  );
}
