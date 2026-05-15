// Thin passthrough layout. The 3-tier navigation (country → language → module)
// is rendered by /admin/cms/[country]/[lang]/layout.tsx for localized routes.
// This wrapper only exists to satisfy the route group hierarchy.

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
