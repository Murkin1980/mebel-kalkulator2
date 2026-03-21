import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Settings (price coefficients, markups, deadlines) ───────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(), // 'material' | 'hardware' | 'markup' | 'deadline'
  unit: text("unit"), // '₸/м²', 'дней', '%', 'коэф.'
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// ─── Leads (client calculation requests) ─────────────────────────────────────
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  furnitureType: text("furniture_type").notNull(), // 'kitchen' | 'wardrobe' | 'dressing'
  // Dimensions
  width: real("width").notNull(),
  height: real("height").notNull(),
  depth: real("depth").notNull(),
  // Material & hardware
  material: text("material").notNull(),
  hardware: text("hardware").notNull(),
  // Extras
  hasDrawers: integer("has_drawers", { mode: "boolean" }),
  drawerCount: integer("drawer_count"),
  hasMirror: integer("has_mirror", { mode: "boolean" }),
  // Result
  basePrice: real("base_price").notNull(),
  markupPercent: real("markup_percent").notNull(),
  finalPrice: real("final_price").notNull(),
  deadline: integer("deadline").notNull(), // days
  notes: text("notes"),
  status: text("status").notNull().default("new"), // 'new' | 'contacted' | 'done'
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
