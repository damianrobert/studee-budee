import { db } from "./db";

export const SETTING_DEFAULTS = {
  weeklyTarget: 5,
  minSessionMinutes: 10,
};

export type AppSettings = typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const out = { ...SETTING_DEFAULTS };
  for (const { key, value } of rows) {
    if (key in out) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key as keyof AppSettings] = n;
    }
  }
  return out;
}

export async function saveSettings(values: Partial<AppSettings>) {
  await db.$transaction(
    Object.entries(values).map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      }),
    ),
  );
}
