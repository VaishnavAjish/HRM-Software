import { format, parseISO, differenceInYears, differenceInMonths, differenceInDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';

export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

export function generateEmployeeId(prefix: string = 'EMP'): string {
  return generateId(prefix);
}

export function generateLeaveId(prefix: string = 'LV'): string {
  return generateId(prefix);
}

export function generatePayrollId(prefix: string = 'PR'): string {
  return generateId(prefix);
}

export function generateAppointmentId(prefix: string = 'APT'): string {
  return generateId(prefix);
}

export function paginate(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
    nextPage: hasNext ? page + 1 : null,
    prevPage: hasPrev ? page - 1 : null,
  };
}

export function buildQuery(filters: Record<string, any>, searchFields: string[] = []): Record<string, any> {
  const query: Record<string, any> = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (key === 'search' && searchFields.length > 0) {
      query.$or = searchFields.map(field => ({
        [field]: { $regex: value, $options: 'i' },
      }));
    } else if (key.startsWith('min') || key.startsWith('max')) {
      const field = key.replace(/^(min|max)/, '').toLowerCase();
      const operator = key.startsWith('min') ? '$gte' : '$lte';
      query[field] = { ...query[field], [operator]: value };
    } else if (Array.isArray(value)) {
      query[key] = { $in: value };
    } else if (typeof value === 'object' && value !== null) {
      query[key] = value;
    } else {
      query[key] = value;
    }
  });

  return query;
}

export function sanitizeObject(obj: Record<string, any>, allowedFields: string[] = []): Record<string, any> {
  const result: Record<string, any> = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (allowedFields.length > 0 && !allowedFields.includes(key)) return;
    if (value === undefined || value === null || value === '') return;
    result[key] = value;
  });

  return result;
}

export function calculateAge(birthDate: Date | string): number {
  const birth = typeof birthDate === 'string' ? parseISO(birthDate) : birthDate;
  return differenceInYears(new Date(), birth);
}

export function calculateTenure(startDate: Date | string, endDate?: Date | string) {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = endDate ? (typeof endDate === 'string' ? parseISO(endDate) : endDate) : new Date();

  const years = differenceInYears(end, start);
  const months = differenceInMonths(end, start) % 12;
  const days = differenceInDays(end, start) % 30;

  return { years, months, days };
}

export function getFinancialYear(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${fyStart}-${fyEnd.toString().slice(-2)}`;
}

export function getQuarter(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return Math.floor(d.getMonth() / 3) + 1;
}

export function maskString(str: string, visibleStart: number = 2, visibleEnd: number = 2): string {
  if (str.length <= visibleStart + visibleEnd) return '*'.repeat(str.length);
  const start = str.slice(0, visibleStart);
  const end = str.slice(-visibleEnd);
  const masked = '*'.repeat(str.length - visibleStart - visibleEnd);
  return `${start}${masked}${end}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

export function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}

export function groupBy<T>(array: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = typeof key === 'function' ? key(item) : String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(array: T[], key: keyof T | ((item: T) => any), order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = typeof key === 'function' ? key(a) : a[key];
    const bVal = typeof key === 'function' ? key(b) : b[key];
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

export function uniqueBy<T>(array: T[], key: keyof T | ((item: T) => string)): T[] {
  const seen = new Set<string>();
  return array.filter(item => {
    const k = typeof key === 'function' ? key(item) : String(item[key]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}