import bcrypt from 'bcryptjs';
import { config } from '@/config/environment';

export interface PasswordStrengthResult {
  score: number;
  strength: 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';
  feedback: string[];
  isValid: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
  'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'master', 'hello',
  'freedom', 'whatever', 'qazwsx', 'trustno1', '654321', '666666',
  'password1', '1234567', '12345678', 'abc12345', 'qwerty123',
  'passw0rd', 'p@ssw0rd', 'p@ssword', 'admin123', 'welcome123',
]);

const KEYBOARD_PATTERNS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890',
  'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz', '0987654321',
];

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, config.bcrypt.saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const needsRehash = (hash: string): boolean => {
  const rounds = parseInt(hash.split('$')[2] || '0', 10);
  return rounds < config.bcrypt.saltRounds;
};

export const rehashPassword = async (password: string, hash: string): Promise<string | null> => {
  if (!needsRehash(hash)) return null;
  const isValid = await verifyPassword(password, hash);
  if (!isValid) return null;
  return hashPassword(password);
};

const hasUppercase = (str: string): boolean => /[A-Z]/.test(str);
const hasLowercase = (str: string): boolean => /[a-z]/.test(str);
const hasNumber = (str: string): boolean => /\d/.test(str);
const hasSpecial = (str: string): boolean => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(str);

const getMaxRepeatingChars = (str: string): number => {
  let maxCount = 1;
  let currentCount = 1;
  for (let i = 1; i < str.length; i++) {
    if (str[i] === str[i - 1]) {
      currentCount++;
      maxCount = Math.max(maxCount, currentCount);
    } else {
      currentCount = 1;
    }
  }
  return maxCount;
};

const hasSequentialChars = (str: string): boolean => {
  const lower = str.toLowerCase();
  for (const pattern of KEYBOARD_PATTERNS) {
    for (let i = 0; i <= pattern.length - 3; i++) {
      const seq = pattern.slice(i, i + 3);
      if (lower.includes(seq)) return true;
    }
  }
  for (let i = 0; i < lower.length - 2; i++) {
    const a = lower.charCodeAt(i);
    const b = lower.charCodeAt(i + 1);
    const c = lower.charCodeAt(i + 2);
    if (b === a + 1 && c === b + 1) return true;
    if (b === a - 1 && c === b - 1) return true;
  }
  return false;
};

const calculateEntropy = (password: string): number => {
  let poolSize = 0;
  if (hasLowercase(password)) poolSize += 26;
  if (hasUppercase(password)) poolSize += 26;
  if (hasNumber(password)) poolSize += 10;
  if (hasSpecial(password)) poolSize += 32;
  return Math.log2(Math.pow(poolSize, password.length));
};

export const checkPasswordStrength = (password: string): PasswordStrengthResult => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < config.password.minLength) {
    feedback.push(`Password must be at least ${config.password.minLength} characters long`);
  } else {
    score += Math.min(25, password.length * 2);
  }

  if (password.length > config.password.maxLength) {
    feedback.push(`Password must not exceed ${config.password.maxLength} characters`);
  }

  if (config.password.requireUppercase && !hasUppercase(password)) {
    feedback.push('Password must contain at least one uppercase letter');
  } else if (hasUppercase(password)) {
    score += 15;
  }

  if (config.password.requireLowercase && !hasLowercase(password)) {
    feedback.push('Password must contain at least one lowercase letter');
  } else if (hasLowercase(password)) {
    score += 15;
  }

  if (config.password.requireNumbers && !hasNumber(password)) {
    feedback.push('Password must contain at least one number');
  } else if (hasNumber(password)) {
    score += 15;
  }

  if (config.password.requireSpecial && !hasSpecial(password)) {
    feedback.push('Password must contain at least one special character');
  } else if (hasSpecial(password)) {
    score += 15;
  }

  const maxRepeating = getMaxRepeatingChars(password);
  if (maxRepeating > config.password.maxRepeatingChars) {
    feedback.push(`Password must not have more than ${config.password.maxRepeatingChars} repeating characters in a row`);
    score -= 10;
  }

  if (hasSequentialChars(password)) {
    feedback.push('Password must not contain sequential characters (e.g., abc, 123, qwe)');
    score -= 15;
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    feedback.push('Password is too common. Please choose a more unique password');
    score -= 30;
  }

  const entropy = calculateEntropy(password);
  if (entropy < 30) {
    feedback.push('Password entropy is too low');
    score -= 10;
  } else if (entropy > 60) {
    score += 10;
  }

  const uniqueChars = new Set(password).size;
  if (uniqueChars < 5) {
    feedback.push('Password should have more character variety');
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let strength: PasswordStrengthResult['strength'];
  if (score < 20) strength = 'very-weak';
  else if (score < 40) strength = 'weak';
  else if (score < 60) strength = 'fair';
  else if (score < 80) strength = 'strong';
  else strength = 'very-strong';

  const isValid = feedback.length === 0 && score >= 40;

  return { score, strength, feedback, isValid };
};

export const validatePassword = (password: string): PasswordValidationResult => {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (password.length < config.password.minLength) {
    errors.push(`Password must be at least ${config.password.minLength} characters`);
  }

  if (password.length > config.password.maxLength) {
    errors.push(`Password must not exceed ${config.password.maxLength} characters`);
  }

  if (config.password.requireUppercase && !hasUppercase(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (config.password.requireLowercase && !hasLowercase(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (config.password.requireNumbers && !hasNumber(password)) {
    errors.push('Password must contain at least one number');
  }

  if (config.password.requireSpecial && !hasSpecial(password)) {
    errors.push('Password must contain at least one special character');
  }

  const maxRepeating = getMaxRepeatingChars(password);
  if (maxRepeating > config.password.maxRepeatingChars) {
    errors.push(`Password must not have more than ${config.password.maxRepeatingChars} repeating characters in a row`);
  }

  if (hasSequentialChars(password)) {
    errors.push('Password must not contain sequential characters');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common');
  }

  return { isValid: errors.length === 0, errors };
};

export const sanitizePassword = (password: string): string => {
  return password.trim();
};

export const generateSecurePassword = (length = 16): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  const allChars = uppercase + lowercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
};

export const checkPasswordHistory = async (
  newPassword: string,
  passwordHistory: string[]
): Promise<boolean> => {
  for (const oldHash of passwordHistory) {
    const isMatch = await verifyPassword(newPassword, oldHash);
    if (isMatch) return true;
  }
  return false;
};

export default {
  hashPassword,
  verifyPassword,
  needsRehash,
  rehashPassword,
  checkPasswordStrength,
  validatePassword,
  sanitizePassword,
  generateSecurePassword,
  checkPasswordHistory,
};