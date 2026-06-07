import { create } from "zustand";

export interface PinnedItem {
  id: string;
  type: "corp" | "person" | "fund";
  label: string;
  uid: string;
}

interface PinboardStore {
  items: PinnedItem[];
  addItem: (item: PinnedItem) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  hasItem: (id: string) => boolean;
}

export const usePinboardStore = create<PinboardStore>((set, get) => ({
  items: [],
  addItem: (item) =>
    set((s) => {
      if (s.items.find((i) => i.id === item.id)) return s;
      return { items: [...s.items, item] };
    }),
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clearAll: () => set({ items: [] }),
  hasItem: (id) => get().items.some((i) => i.id === id),
}));
