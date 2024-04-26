/* eslint-disable camelcase */
'use strict';

import * as utils from './utils.js';

/* eslint-disable camelcase */

/* eslint-disable camelcase */

const rotr32 = utils.rotr32;

export function ft_1(s: number, x: number, y: number, z: number) {
  if (s === 0) {
    return ch32(x, y, z);
  }
  if (s === 1 || s === 3) {
    return p32(x, y, z);
  }
  if (s === 2) {
    return maj32(x, y, z);
  }
}

export function ch32(x: number, y: number, z: number) {
  return (x & y) ^ (~x & z);
}

export function maj32(x: number, y: number, z: number) {
  return (x & y) ^ (x & z) ^ (y & z);
}

export function p32(x: number, y: number, z: number) {
  return x ^ y ^ z;
}

export function s0_256(x: number) {
  return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
}

export function s1_256(x: number) {
  return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
}

export function g0_256(x: number) {
  return rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
}

export function g1_256(x: number) {
  return rotr32(x, 17) ^ rotr32(x, 19) ^ (x >>> 10);
}
