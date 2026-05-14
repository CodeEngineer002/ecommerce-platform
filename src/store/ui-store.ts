import { create } from "zustand";

interface UIState {
  isMobileMenuOpen: boolean;
  isSearchOpen: boolean;
  activeModal: string | null;
  toast: { message: string; type: "success" | "error" | "info" } | null;

  openMobileMenu: () => void;
  closeMobileMenu: () => void;

  openSearch: () => void;
  closeSearch: () => void;

  openModal: (id: string) => void;
  closeModal: () => void;

  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMobileMenuOpen: false,
  isSearchOpen: false,
  activeModal: null,
  toast: null,

  openMobileMenu: () => set({ isMobileMenuOpen: true }),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),

  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),

  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  showToast: (message, type = "info") => set({ toast: { message, type } }),
  hideToast: () => set({ toast: null }),
}));
