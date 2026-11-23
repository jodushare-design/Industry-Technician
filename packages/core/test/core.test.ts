import { describe, expect, it } from 'vitest';
import {
  AppError,
  ROLES,
  can,
  findCopyViolations,
  formatInr,
  indianMobile,
  otpVerifySchema,
  parseOrThrow,
  redact,
  rolesAllowed,
  sumPaise,
  toAppError,
  toDecimalString,
  toPaise,
} from '../src';

describe('roles and permissions', () => {
  it('only customers may approve estimates and part costs — never staff', () => {
    expect(rolesAllowed('estimate.decide')).toEqual(['customer']);
    expect(rolesAllowed('part.decide')).toEqual(['customer']);
    expect(can(['platform_admin', 'support_agent'], 'estimate.decide')).toBe(false);
  });

  it('platform staff cannot create estimates or assign company employees', () => {
    expect(can(['platform_admin'], 'estimate.draft')).toBe(false);
    expect(can(['platform_admin'], 'estimate.send')).toBe(false);
    expect(can(['platform_admin'], 'job.assign_employee')).toBe(false);
  });

  it('support can suggest providers but not invite them for a customer', () => {
    expect(can(['support_agent'], 'service_request.suggest_provider')).toBe(true);
    expect(can(['support_agent'], 'service_request.invite_provider')).toBe(false);
  });

  it('a user holding several roles gets the union', () => {
    expect(can(['technician', 'customer'], 'estimate.decide')).toBe(true);
    expect(can(['technician', 'customer'], 'estimate.send')).toBe(true);
  });

  it('every role is known', () => {
    expect(ROLES).toHaveLength(6);
  });
});

describe('validation', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ])('normalises %s', (input, expected) => {
    expect(indianMobile.parse(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '+1 415 555 0100', ''])('rejects %s', (input) => {
    expect(indianMobile.safeParse(input).success).toBe(false);
  });

  it('parseOrThrow returns field errors as an AppError', () => {
    try {
      parseOrThrow(otpVerifySchema, { phone: '123', token: 'abc' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('validation');
      expect(Object.keys(err.fieldErrors ?? {}).sort()).toEqual(['phone', 'token']);
    }
  });
});

describe('money (INR)', () => {
  it('converts without floating-point error', () => {
    expect(toPaise('0.1') + toPaise('0.2')).toBe(30n);
    expect(toPaise(1234.5)).toBe(123450n);
    expect(toPaise('1,00,000')).toBe(10000000n);
    expect(toDecimalString(toPaise('500'))).toBe('500.00');
  });

  it('rejects invalid amounts', () => {
    expect(() => toPaise('-1')).toThrow(RangeError);
    expect(() => toPaise('1.234')).toThrow(RangeError);
    expect(() => toPaise('abc')).toThrow(RangeError);
    expect(() => toPaise('12345678901')).toThrow(RangeError); // > numeric(12,2)
  });

  it('formats with Indian digit grouping', () => {
    expect(formatInr(toPaise('500'))).toBe('₹500.00');
    expect(formatInr(toPaise('123456.7'))).toBe('₹1,23,456.70');
    expect(formatInr(toPaise('12345678'))).toBe('₹1,23,45,678.00');
    expect(formatInr(sumPaise([toPaise('500'), toPaise('250.25')]))).toBe('₹750.25');
  });
});

describe('error mapping', () => {
  it('maps RLS denial to forbidden', () => {
    expect(toAppError({ code: '42501', message: 'new row violates row-level security policy' }).code).toBe('forbidden');
  });

  it('maps SQL business rules to their message', () => {
    const e = toAppError({ code: 'P0001', message: 'ITM:estimate_locked: An accepted estimate cannot be changed' });
    expect(e.code).toBe('business_rule');
    expect(e.userMessage).toBe('An accepted estimate cannot be changed');
  });

  it('maps the SQL rate limit to rate_limited, keeping its message', () => {
    const e = toAppError({ code: 'P0001', message: 'ITM:rate_limited: Please wait a little and try again.' });
    expect(e.code).toBe('rate_limited');
    expect(e.userMessage).toBe('Please wait a little and try again.');
  });

  it('maps fetch failures to network', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network');
  });

  it('never leaks raw database text in userMessage', () => {
    const e = toAppError({ code: 'XX000', message: 'internal: relation secret_table' });
    expect(e.code).toBe('unknown');
    expect(e.userMessage).not.toContain('secret_table');
  });
});

describe('copy rules', () => {
  it.each([
    'Our technicians will be there in an hour',
    "We'll repair your machine",
    'We will fix it today',
    'Guaranteed industrial repair',
    'Certified engineers',
  ])('flags "%s"', (text) => {
    expect(findCopyViolations(text).length).toBeGreaterThan(0);
  });

  it.each([
    'Find a technician',
    'Independent service provider',
    'Contact provider',
    'Provider estimate',
    'Customer approval',
  ])('allows "%s"', (text) => {
    expect(findCopyViolations(text)).toEqual([]);
  });
});

describe('redact', () => {
  it('removes phone numbers from log text', () => {
    expect(redact('call +919876543210 or 9876543210')).toBe('call [phone] or [phone]');
  });
});
