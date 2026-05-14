import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "details", "summary",
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions["allowedAttributes"] = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a:   ["href", "name", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading", "class"],
  "*": ["class", "id"],
};

export function sanitizeCmsHtml(dirty: string | null | undefined): string | null {
  if (!dirty) return dirty ?? null;
  return sanitizeHtml(dirty, {
    allowedTags:       ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes:    ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}
