import { env } from '../config/env';
import { mockDriver } from './mockDrivers';
import { realDriver } from './realDrivers';
import type { ProjectDriver } from './types';

export function getDriver(): ProjectDriver {
  return env.PANEL_DRIVER === 'real' ? realDriver : mockDriver;
}

export type { ProjectDriver, RuntimeStats, LogStream, OutputFn } from './types';
