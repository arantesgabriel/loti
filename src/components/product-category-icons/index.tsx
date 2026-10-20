import { productCategoryKey, type ProductCategoryKey } from "@/lib/domain/categories";

// Original category silhouettes, all drawn on the same 24px grid.
const shapes: Record<ProductCategoryKey, string> = {
  generic: "M4 7 12 3 20 7v10l-8 4-8-4Z M4 7l8 4 8-4 M12 11v10 M8 5l8 4",
  sneaker: "M3 14l7-3 3-6 4 2 1 5 3 3v4H3Z M3 16h18 M10 11l3 2 M12 9l3 2",
  clog: "M3 14c0-3 4-5 9-5l4-3c3 0 4 4 5 8v4H3Z M3 15h18 M14 9l3 3 2-2 M7 12h.1 M10 12h.1 M13 13h.1",
  sandal: "M7 3c-3 2-4 7-3 12 1 5 4 7 8 6s7-5 7-10c0-6-5-9-12-8Z M5 10l11-4 M6 16l13-5",
  tshirt: "M8 4 3 7l-2 5 5 2 1-3v10h10V11l1 3 5-2-2-5-5-3c-1 3-7 3-8 0Z",
  hoodie: "M8 7c-2-6 10-6 8 0l4 3 2 10-4 1-2-8v8H8v-8l-2 8-4-1 2-10Z M8 7l4 3 4-3 M9 17h6 M10 10v3 M14 10v3",
  pants: "M6 3h12l1 18h-6l-1-12-1 12H5Z M6 6h12 M12 3v4",
  ssd_nvme: "M3 7h18v10H3Z M3 10h3 M3 14h3 M9 10h7v4H9Z M19 12h.1",
  ssd_sata: "M5 3h14v18H5Z M8 7h8v7H8Z M9 18h6",
  ram: "M2 6h20v11H2Z M4 17v3h7v-3 M14 17v3h6v-3 M5 9h3v5H5Z M11 9h3v5h-3Z M17 9h3v5h-3Z",
  motherboard: "M4 3h16v18H4Z M7 7h6v6H7Z M16 6v9 M7 17h10 M7 5h4",
  cpu: "M6 6h12v12H6Z M9 9h6v6H9Z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4",
  gpu: "M3 6h18v12H3Z M3 18v3 M6 18v2 M11 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0 M19 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  laptop: "M5 4h14v12H5Z M5 16l-3 4h20l-3-4 M10 17h4",
  smartphone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M10 5h4 M11 19h2",
  smartwatch: "M8 7V2h8v5 M8 17v5h8v-5 M8 7h8a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z M12 9v3l2 1",
  keyboard: "M2 6h20v12H2Z M5 9h.1 M8 9h.1 M11 9h.1 M14 9h.1 M17 9h.1 M20 9h.1 M5 12h.1 M8 12h.1 M11 12h.1 M14 12h.1 M17 12h.1 M6 15h12",
  mouse: "M12 2c-4 0-7 3-7 7v6a7 7 0 0 0 14 0V9c0-4-3-7-7-7Z M12 2v8 M5 10h14 M12 5v2",
  headphones: "M4 14V10a8 8 0 0 1 16 0v4 M4 12h3v9H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z M20 12h-3v9h3a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Z",
  controller: "M7 6h10c3 0 5 5 5 11 0 3-3 3-5 0l-2-2H9l-2 2c-2 3-5 3-5 0 0-6 2-11 5-11Z M7 9v5 M4.5 11.5h5 M16 10h.1 M19 13h.1",
};

export function ProductCategoryMarker({ visualKey }: { visualKey: string }) {
  const category = productCategoryKey(visualKey);
  return <span className="category-marker" aria-hidden="true" data-category={category}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d={shapes[category]} /></svg>
  </span>;
}
