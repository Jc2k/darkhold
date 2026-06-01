export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return formatDate(date) === value ? date : null;
}

export function isMealPlanDateInPast(value: string, today = new Date()): boolean {
  const date = parseLocalDate(value.slice(0, 10));
  return date !== null && formatDate(date) < formatDate(today);
}

export function getMealPlanWeekStartSaturday(referenceDate: Date): Date {
  const base = new Date(referenceDate);
  base.setHours(0, 0, 0, 0);
  const daysBackToSaturday = (base.getDay() + 1) % 7;
  base.setDate(base.getDate() - daysBackToSaturday);
  return base;
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function getWeekStartingSaturday(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + daysUntilSaturday + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    return d;
  });
}
