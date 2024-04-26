/* eslint-disable camelcase */

export function toHex(msg: Uint32Array) {
  let res = '';
  for (let i = 0; i < msg.length; i++) {
    res += zero2(msg[i].toString(16));
  }
  return res;
}

export function zero2(word: string) {
  if (word.length === 1) {
    return '0' + word;
  } else {
    return word;
  }
}
export function htonl(w: number) {
  const res = (w >>> 24) | ((w >>> 8) & 0xff00) | ((w << 8) & 0xff0000) | ((w & 0xff) << 24);
  return res >>> 0;
}

export function toHex32(msg: Buffer, endian: string) {
  let res = '';
  for (let i = 0; i < msg.length; i++) {
    let w = msg[i];
    if (endian === 'little') {
      w = htonl(w);
    }
    res += zero8(w.toString(16));
  }
  return res;
}

export function zero8(word: string) {
  if (word.length === 7) {
    return '0' + word;
  } else if (word.length === 6) {
    return '00' + word;
  } else if (word.length === 5) {
    return '000' + word;
  } else if (word.length === 4) {
    return '0000' + word;
  } else if (word.length === 3) {
    return '00000' + word;
  } else if (word.length === 2) {
    return '000000' + word;
  } else if (word.length === 1) {
    return '0000000' + word;
  } else {
    return word;
  }
}

export function join32(msg: number[], start: number, end: number, endian: string) {
  const len = end - start;
  const res = new Array(len / 4);
  for (let i = 0, k = start; i < res.length; i++, k += 4) {
    let w;
    if (endian === 'big') {
      w = (msg[k] << 24) | (msg[k + 1] << 16) | (msg[k + 2] << 8) | msg[k + 3];
    } else {
      w = (msg[k + 3] << 24) | (msg[k + 2] << 16) | (msg[k + 1] << 8) | msg[k];
    }
    res[i] = w >>> 0;
  }
  return res;
}

export function split32(msg: Buffer, endian: string) {
  const res = new Array(msg.length * 4);
  for (let i = 0, k = 0; i < msg.length; i++, k += 4) {
    const m = msg[i];
    if (endian === 'big') {
      res[k] = m >>> 24;
      res[k + 1] = (m >>> 16) & 0xff;
      res[k + 2] = (m >>> 8) & 0xff;
      res[k + 3] = m & 0xff;
    } else {
      res[k + 3] = m >>> 24;
      res[k + 2] = (m >>> 16) & 0xff;
      res[k + 1] = (m >>> 8) & 0xff;
      res[k] = m & 0xff;
    }
  }
  return res;
}

export function rotr32(w: number, b: number) {
  return (w >>> b) | (w << (32 - b));
}

export function rotl32(w: number, b: number) {
  return (w << b) | (w >>> (32 - b));
}

export function sum32(a: number, b: number) {
  return (a + b) >>> 0;
}

export function sum32_3(a: number, b: number, c: number) {
  return (a + b + c) >>> 0;
}

export function sum32_4(a: number, b: number, c: number, d: number) {
  return (a + b + c + d) >>> 0;
}

export function sum32_5(a: number, b: number, c: number, d: number, e: number) {
  return (a + b + c + d + e) >>> 0;
}

export function sum64(buf: Buffer, pos: number, ah: number, al: number) {
  const bh = buf[pos];
  const bl = buf[pos + 1];

  const lo = (al + bl) >>> 0;
  const hi = (lo < al ? 1 : 0) + ah + bh;
  buf[pos] = hi >>> 0;
  buf[pos + 1] = lo;
}

export function sum64_hi(ah: number, al: number, bh: number, bl: number) {
  const lo = (al + bl) >>> 0;
  const hi = (lo < al ? 1 : 0) + ah + bh;
  return hi >>> 0;
}

export function sum64_lo(ah: number, al: number, bh: number, bl: number) {
  const lo = al + bl;
  return lo >>> 0;
}

export function sum64_4_hi(
  ah: number,
  al: number,
  bh: number,
  bl: number,
  ch: number,
  cl: number,
  dh: number,
  dl: number,
) {
  let carry = 0;
  let lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;

  const hi = ah + bh + ch + dh + carry;
  return hi >>> 0;
}

export function sum64_4_lo(
  ah: number,
  al: number,
  bh: number,
  bl: number,
  ch: number,
  cl: number,
  dh: number,
  dl: number,
) {
  const lo = al + bl + cl + dl;
  return lo >>> 0;
}

export function sum64_5_hi(
  ah: number,
  al: number,
  bh: number,
  bl: number,
  ch: number,
  cl: number,
  dh: number,
  dl: number,
  eh: number,
  el: number,
) {
  let carry = 0;
  let lo = al;
  lo = (lo + bl) >>> 0;
  carry += lo < al ? 1 : 0;
  lo = (lo + cl) >>> 0;
  carry += lo < cl ? 1 : 0;
  lo = (lo + dl) >>> 0;
  carry += lo < dl ? 1 : 0;
  lo = (lo + el) >>> 0;
  carry += lo < el ? 1 : 0;

  const hi = ah + bh + ch + dh + eh + carry;
  return hi >>> 0;
}

export function sum64_5_lo(
  ah: number,
  al: number,
  bh: number,
  bl: number,
  ch: number,
  cl: number,
  dh: number,
  dl: number,
  eh: number,
  el: number,
) {
  const lo = al + bl + cl + dl + el;

  return lo >>> 0;
}

export function rotr64_hi(ah: number, al: number, num: number) {
  const r = (al << (32 - num)) | (ah >>> num);
  return r >>> 0;
}

export function rotr64_lo(ah: number, al: number, num: number) {
  const r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}

export function shr64_hi(ah: number, num: number) {
  return ah >>> num;
}

export function shr64_lo(ah: number, al: number, num: number) {
  const r = (ah << (32 - num)) | (al >>> num);
  return r >>> 0;
}
