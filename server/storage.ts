import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { settings, leads, type Settings, type InsertSettings, type Lead, type InsertLead } from "@shared/schema";

const sqlite = new Database("furniture.db");
export const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    furniture_type TEXT NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    depth REAL NOT NULL,
    material TEXT NOT NULL,
    hardware TEXT NOT NULL,
    has_drawers INTEGER,
    drawer_count INTEGER,
    has_mirror INTEGER,
    base_price REAL NOT NULL,
    markup_percent REAL NOT NULL,
    final_price REAL NOT NULL,
    deadline INTEGER NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new'
  );
`);

// Seed default settings if empty
const existing = db.select().from(settings).all();
if (existing.length === 0) {
  const defaults: InsertSettings[] = [
    // Material base prices (₸ per m²)
    { key: "mat_ldsp", label: "ЛДСП (цена за м²)", value: "8500", category: "material", unit: "₸/м²" },
    { key: "mat_mdf", label: "МДФ (цена за м²)", value: "12000", category: "material", unit: "₸/м²" },
    { key: "mat_massiv", label: "Массив дерева (цена за м²)", value: "28000", category: "material", unit: "₸/м²" },
    { key: "mat_eco", label: "Экошпон (цена за м²)", value: "15000", category: "material", unit: "₸/м²" },
    // Hardware coefficients (multiplier on base)
    { key: "hw_econom", label: "Фурнитура Эконом (коэф.)", value: "1.0", category: "hardware", unit: "коэф." },
    { key: "hw_blum", label: "Фурнитура Blum (коэф.)", value: "1.35", category: "hardware", unit: "коэф." },
    { key: "hw_hettich", label: "Фурнитура Hettich (коэф.)", value: "1.25", category: "hardware", unit: "коэф." },
    // Markups per furniture type (%)
    { key: "markup_kitchen", label: "Наценка — Кухня (%)", value: "30", category: "markup", unit: "%" },
    { key: "markup_wardrobe", label: "Наценка — Шкаф-купе (%)", value: "25", category: "markup", unit: "%" },
    { key: "markup_dressing", label: "Наценка — Гардероб (%)", value: "20", category: "markup", unit: "%" },
    // Extras per unit
    { key: "drawer_price", label: "Ящик выдвижной (за шт.)", value: "4500", category: "markup", unit: "₸/шт." },
    { key: "mirror_price", label: "Зеркальная дверь (за шт.)", value: "18000", category: "markup", unit: "₸/шт." },
    // Deadlines (days)
    { key: "dl_kitchen", label: "Срок изготовления — Кухня", value: "21", category: "deadline", unit: "дней" },
    { key: "dl_wardrobe", label: "Срок изготовления — Шкаф-купе", value: "14", category: "deadline", unit: "дней" },
    { key: "dl_dressing", label: "Срок изготовления — Гардероб", value: "18", category: "deadline", unit: "дней" },
    // WhatsApp number
    { key: "whatsapp_number", label: "Номер WhatsApp (без +)", value: "77001234567", category: "markup", unit: "" },
    // Google Sheets webhook URL
    { key: "sheets_webhook", label: "Google Sheets Webhook URL", value: "", category: "markup", unit: "" },
  ];
  for (const s of defaults) {
    db.insert(settings).values(s).run();
  }
}

export interface IStorage {
  getAllSettings(): Settings[];
  updateSetting(key: string, value: string): Settings | undefined;
  createLead(lead: InsertLead): Lead;
  getAllLeads(): Lead[];
  updateLeadStatus(id: number, status: string): Lead | undefined;
  deleteLead(id: number): void;
}

export const storage: IStorage = {
  getAllSettings() {
    return db.select().from(settings).all();
  },

  updateSetting(key, value) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run();
    return db.select().from(settings).where(eq(settings.key, key)).get();
  },

  createLead(lead) {
    return db.insert(leads).values(lead).returning().get();
  },

  getAllLeads() {
    return db.select().from(leads).all();
  },

  updateLeadStatus(id, status) {
    db.update(leads).set({ status }).where(eq(leads.id, id)).run();
    return db.select().from(leads).where(eq(leads.id, id)).get();
  },

  deleteLead(id) {
    db.delete(leads).where(eq(leads.id, id)).run();
  },
};
