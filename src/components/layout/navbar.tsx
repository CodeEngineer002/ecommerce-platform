"use client";

import { Heart, LogOut, MapPin, Menu, Package, Search, ShoppingCart, User, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { getInitials } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";

interface NavbarProps {
  user?: { id: string; email?: string; full_name?: string; avatar_url?: string } | null;
}

const navLinks = [
  { href: ROUTES.products, label: "Shop" },
  { href: ROUTES.category("electronics"), label: "Electronics" },
  { href: ROUTES.category("fashion"), label: "Fashion" },
  { href: ROUTES.sale, label: "Sale" },
];

export function Navbar({ user }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Defer persisted store reads until after hydration.
  // Zustand's `persist` loads localStorage synchronously on the client, so
  // without this flag the badge counts differ between SSR (always 0) and the
  // first client render, triggering a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { toggleCart, itemCount } = useCartStore();
  const wishlistCount = useWishlistStore((s) => s.items.length);
  // Show 0 on both server and first client render; real value after hydration
  const count = mounted ? itemCount() : 0;
  const displayWishlistCount = mounted ? wishlistCount : 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href={ROUTES.home} className="text-xl font-bold text-primary">
          {APP_NAME}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={ROUTES.search} aria-label="Search">
              <Search className="h-5 w-5" />
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild className="relative">
            <Link href={ROUTES.wishlist} aria-label="Wishlist">
              <Heart className="h-5 w-5" />
              {displayWishlistCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {displayWishlistCount}
                </span>
              )}
            </Link>
          </Button>

          <Button variant="ghost" size="icon" className="relative" onClick={toggleCart} aria-label="Cart">
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                    <AvatarImage src={user.avatar_url ?? ""} />
                    <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                      {getInitials(user.full_name ?? user.email ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[96px] truncate text-sm font-medium md:block">
                    {user.full_name?.split(" ")[0] ?? user.email?.split("@")[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 shadow-lg">
                {/* User identity header */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5 mb-1">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarImage src={user.avatar_url ?? ""} />
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {getInitials(user.full_name ?? user.email ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    {user.full_name && (
                      <p className="truncate text-sm font-semibold leading-tight">{user.full_name}</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <DropdownMenuSeparator className="my-1" />

                <DropdownMenuItem asChild className="gap-2.5 rounded-lg px-3 py-2 text-sm">
                  <Link href={ROUTES.profile}>
                    <User className="h-4 w-4 text-muted-foreground" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="gap-2.5 rounded-lg px-3 py-2 text-sm">
                  <Link href={ROUTES.addresses}>
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    My Addresses
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="gap-2.5 rounded-lg px-3 py-2 text-sm">
                  <Link href={ROUTES.orders}>
                    <Package className="h-4 w-4 text-muted-foreground" />
                    My Orders
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1" />

                <DropdownMenuItem asChild className="gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive focus:text-destructive">
                  <form action="/api/auth/signout" method="post" className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2.5">
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="icon" asChild>
              <Link href={ROUTES.login} aria-label="Sign in">
                <User className="h-5 w-5" />
              </Link>
            </Button>
          )}

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t md:hidden">
          <nav className="container flex flex-col py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-2 text-sm font-medium hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
