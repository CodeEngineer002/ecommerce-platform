# Admin Architecture

Modular, permission-aware, locale-ready admin platform.

---

## Layout Architecture

```
/admin/*  →  AdminLayout (server component)
               ↓ fetch user + profile + permissions
             AdminProvider (client context)
               ↓ provides { user, profile, permissions, hasPermission }
             AdminSidebar (permission-aware grouped nav)
             main (page content)
```

`AdminLayout` runs server-side on every admin request:
1. Auth check — redirects to login if no session
2. Role check — `profiles.role IN ('admin', 'super_admin')` required
3. Permission fetch — `user_roles → roles → role_permissions → permissions`
4. Wraps children with `AdminProvider`

---

## RBAC Enforcement

### Three layers:

**1. Server component (layout-level)**
```typescript
// admin/layout.tsx
if (!['admin', 'super_admin'].includes(profile.role)) redirect('/')
```

**2. Client context**
```typescript
const { hasPermission } = useAdminContext();
if (!hasPermission('cms:edit')) return <Forbidden />
```

**3. Database RLS (authoritative)**
```sql
-- RLS enforces is_admin() or has_permission() for every write
```

### `PermissionGate` component:
```tsx
<PermissionGate permission="cms:publish">
  <PublishButton />   {/* Only rendered if user has cms:publish */}
</PermissionGate>
```

**Rule:** Frontend gating is UX only. RLS is the authoritative security layer.

---

## Admin Sidebar Groups

```
Overview
  Dashboard
  Analytics              [analytics:read]

Catalog                  [catalog:read]
  Products
  Categories
  Inventory              [inventory:read]

Commerce                 [orders:read]
  Orders
  Customers              [customers:read]

Content                  [cms:read]
  Pages                  [cms:edit]
  Homepage               [cms:edit]
  Navigation             [cms:manage_navigation]
  Banners                [cms:manage_banners]
  Blocks                 [cms:edit]
  Media                  [cms:manage_media]
```

Groups and items hidden when user lacks the required permission.

---

## Admin Routes

```
/admin                    Dashboard
/admin/products           Product catalog
/admin/products/new       Create product
/admin/products/:id/edit  Edit product
/admin/categories         Category tree
/admin/orders             Order management
/admin/customers          Customer profiles
/admin/inventory          Stock management
/admin/analytics          KPI dashboard
/admin/cms                CMS pages
/admin/cms/homepage       Homepage sections
/admin/cms/blocks         Reusable blocks
/admin/cms/navigation     Navigation menus
/admin/cms/banners        Promotional banners
/admin/cms/media          Media library
```

---

## Adding a New Admin Module

1. Add route to `ROUTES.admin` in `src/lib/constants.ts`
2. Create `src/app/admin/{module}/page.tsx`
3. Add to `NAV_GROUPS` in `admin-sidebar.tsx` with the appropriate permission
4. Create service in `src/features/{domain}/services/`
5. Create hooks in `src/features/{domain}/hooks/`
