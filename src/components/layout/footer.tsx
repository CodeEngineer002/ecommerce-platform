import Link from "next/link";

import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-lg font-bold">{APP_NAME}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your one-stop destination for quality products delivered to your door.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Shop</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/products" className="hover:text-foreground">All Products</Link></li>
              <li><Link href="/categories/electronics" className="hover:text-foreground">Electronics</Link></li>
              <li><Link href="/categories/fashion" className="hover:text-foreground">Fashion</Link></li>
              <li><Link href="/sale" className="hover:text-foreground">Sale</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold">Account</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/profile" className="hover:text-foreground">My Profile</Link></li>
              <li><Link href="/orders" className="hover:text-foreground">My Orders</Link></li>
              <li><Link href="/wishlist" className="hover:text-foreground">Wishlist</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold">Help</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/pages/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link href="/pages/shipping" className="hover:text-foreground">Shipping Policy</Link></li>
              <li><Link href="/pages/returns" className="hover:text-foreground">Returns</Link></li>
              <li><Link href="/pages/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
