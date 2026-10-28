export const THEME_COOKIE = "sb_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(v: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "system";
}
