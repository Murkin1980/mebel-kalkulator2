import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema } from "@shared/schema";
import { z } from "zod";

export function registerRoutes(httpServer: Server, app: Express) {
  // ─── Settings ──────────────────────────────────────────────────────────────
  app.get("/api/settings", (_req, res) => {
    const all = storage.getAllSettings();
    res.json(all);
  });

  app.patch("/api/settings/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: "value required" });
    const updated = storage.updateSetting(key, String(value));
    if (!updated) return res.status(404).json({ error: "Setting not found" });
    res.json(updated);
  });

  // ─── Calculate (stateless) ─────────────────────────────────────────────────
  app.post("/api/calculate", (req, res) => {
    const schema = z.object({
      furnitureType: z.enum(["kitchen", "wardrobe", "dressing"]),
      width: z.number().positive(),
      height: z.number().positive(),
      depth: z.number().positive(),
      material: z.enum(["mat_ldsp", "mat_mdf", "mat_massiv", "mat_eco"]),
      hardware: z.enum(["hw_econom", "hw_blum", "hw_hettich"]),
      hasDrawers: z.boolean().optional(),
      drawerCount: z.number().int().min(0).optional(),
      hasMirror: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const d = parsed.data;
    const allSettings = storage.getAllSettings();
    const get = (key: string) => {
      const s = allSettings.find((s) => s.key === key);
      return s ? parseFloat(s.value) : 0;
    };

    // Base area in m²
    const area = (d.width / 100) * (d.height / 100); // input in cm
    const matPrice = get(d.material);
    const hwCoef = get(d.hardware);

    let basePrice = area * matPrice * hwCoef;

    // Extras
    if (d.hasDrawers && d.drawerCount) {
      basePrice += d.drawerCount * get("drawer_price");
    }
    if (d.hasMirror) {
      basePrice += get("mirror_price");
    }

    // Markup
    const markupKey = `markup_${d.furnitureType}`;
    const markupPct = get(markupKey);
    const finalPrice = basePrice * (1 + markupPct / 100);

    // Deadline
    const deadlineKey = `dl_${d.furnitureType}`;
    const deadline = get(deadlineKey);

    res.json({
      basePrice: Math.round(basePrice),
      markupPercent: markupPct,
      finalPrice: Math.round(finalPrice),
      deadline,
      area: +area.toFixed(2),
    });
  });

  // ─── Leads ─────────────────────────────────────────────────────────────────
  app.post("/api/leads", async (req, res) => {
    const parsed = insertLeadSchema.safeParse({
      ...req.body,
      createdAt: new Date().toISOString(),
      status: "new",
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const lead = storage.createLead(parsed.data);

    // Send to Google Sheets webhook if configured
    const allSettings = storage.getAllSettings();
    const webhookUrl = allSettings.find((s) => s.key === "sheets_webhook")?.value;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        });
      } catch {
        // Non-fatal — log but don't fail
        console.warn("Google Sheets webhook failed");
      }
    }

    res.json(lead);
  });

  app.get("/api/leads", (_req, res) => {
    const all = storage.getAllLeads();
    res.json(all);
  });

  app.patch("/api/leads/:id/status", (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["new", "contacted", "done"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const updated = storage.updateLeadStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Lead not found" });
    res.json(updated);
  });

  app.delete("/api/leads/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteLead(id);
    res.json({ ok: true });
  });
}
