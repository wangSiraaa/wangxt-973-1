import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export function generateId(prefix = '') {
  return prefix + uuidv4().replace(/-/g, '').slice(0, 16);
}

export function generateOrderNo() {
  return 'LK' + dayjs().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

export function now() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

export function today() {
  return dayjs().format('YYYY-MM-DD');
}

export function addHours(dateStr, hours) {
  return dayjs(dateStr).add(hours, 'hour').format('YYYY-MM-DD HH:mm:ss');
}

export function diffHours(start, end) {
  return Math.max(0, dayjs(end).diff(dayjs(start), 'hour', true));
}

export function diffHoursCeil(start, end) {
  return Math.ceil(Math.max(0, dayjs(end).diff(dayjs(start), 'hour', true)));
}
