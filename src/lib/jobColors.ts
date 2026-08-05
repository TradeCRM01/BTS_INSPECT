// SimPRO-style color palette for jobs and employees.
// Each job gets a color from JOB_COLORS. Each employee gets a color
// from EMPLOYEE_COLORS for their column header / avatar.

export const JOB_COLORS = [
  '#2E75B6', // blue
  '#1B7F3A', // green
  '#F7931A', // orange
  '#B42318', // red
  '#7C3AED', // purple
  '#0891B2', // cyan
  '#DB2777', // pink
  '#CA8A04', // gold
  '#0A2540', // navy
  '#059669', // emerald
  '#DC2626', // bright red
  '#4F46E5', // indigo
];

export const EMPLOYEE_COLORS = [
  '#2E75B6', // blue
  '#1B7F3A', // green
  '#F7931A', // orange
  '#B42318', // red
  '#7C3AED', // purple
  '#0891B2', // cyan
  '#DB2777', // pink
  '#CA8A04', // gold
];

// Deterministically pick a color for a job based on its ID,
// so the same job always gets the same color unless explicitly set.
export function pickJobColor(seed: string, explicit?: string | null): string {
  if (explicit) return explicit;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return JOB_COLORS[Math.abs(hash) % JOB_COLORS.length];
}

// Deterministically pick a color for an employee based on their ID.
export function pickEmployeeColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return EMPLOYEE_COLORS[Math.abs(hash) % EMPLOYEE_COLORS.length];
}

// Convert a hex color to a soft background (low opacity)
export function hexToBg(hex: string, opacity = 0.12): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Convert a hex color to a medium-opacity border
export function hexToBorder(hex: string, opacity = 0.35): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Get a readable text color (dark or light) for a given hex background
export function getReadableText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#1A1A1A' : '#FFFFFF';
}
