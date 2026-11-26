import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface ZipEntry {
  name: string;
  nameBuf: Buffer;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  modTime: number;
  modDate: number;
  flags: number;
  versionMadeBy: number;
  versionNeeded: number;
  internalAttr: number;
  externalAttr: number;
  compressedData: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocdOffset(zipBuf: Buffer): number {
  const minOffset = Math.max(0, zipBuf.length - 65557);
  for (let i = zipBuf.length - 22; i >= minOffset; i--) {
    if (
      zipBuf[i] === 0x50 &&
      zipBuf[i + 1] === 0x4b &&
      zipBuf[i + 2] === 0x05 &&
      zipBuf[i + 3] === 0x06
    ) {
      const commentLen = zipBuf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === zipBuf.length) {
        return i;
      }
    }
  }
  throw new Error('ZIP End of Central Directory not found');
}

function parseZipEntries(zipBuf: Buffer): ZipEntry[] {
  const eocdOffset = findEocdOffset(zipBuf);
  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`Invalid central directory header at ${pos}`);
    }
    const versionMadeBy = zipBuf.readUInt16LE(pos + 4);
    const versionNeeded = zipBuf.readUInt16LE(pos + 6);
    const flags = zipBuf.readUInt16LE(pos + 8);
    const compressionMethod = zipBuf.readUInt16LE(pos + 10);
    const modTime = zipBuf.readUInt16LE(pos + 12);
    const modDate = zipBuf.readUInt16LE(pos + 14);
    const crc32 = zipBuf.readUInt32LE(pos + 16);
    const compressedSize = zipBuf.readUInt32LE(pos + 20);
    const uncompressedSize = zipBuf.readUInt32LE(pos + 24);
    const nameLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commentLen = zipBuf.readUInt16LE(pos + 32);
    const internalAttr = zipBuf.readUInt16LE(pos + 36);
    const externalAttr = zipBuf.readUInt32LE(pos + 38);
    const localHeaderOffset = zipBuf.readUInt32LE(pos + 42);

    const nameBuf = zipBuf.subarray(pos + 46, pos + 46 + nameLen);
    const name = nameBuf.toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    if (zipBuf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header at ${localHeaderOffset}`);
    }
    const lfhNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const lfhExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const compressedData = Buffer.from(zipBuf.subarray(dataStart, dataStart + compressedSize));

    entries.push({
      name,
      nameBuf: Buffer.from(nameBuf),
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      modTime,
      modDate,
      flags: flags & ~0x0008, // clear data descriptor bit since sizes are written inline
      versionMadeBy,
      versionNeeded,
      internalAttr,
      externalAttr,
      compressedData,
    });
  }

  return entries;
}

function buildAlignedZipParts(entries: ZipEntry[]): {
  section1: Buffer;
  centralDirectory: Buffer;
  eocdWithoutCdOffset: Buffer;
} {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    // 4-byte align all stored (uncompressed) entries (resources.arsc, PNGs, assets) per Android 11+ zipalign rules
    let padLen = 0;
    if (entry.compressionMethod === 0) {
      const dataOffset = offset + 30 + entry.nameBuf.length;
      const rem = dataOffset % 4;
      padLen = rem === 0 ? 0 : 4 - rem;
    }

    const lfh = Buffer.alloc(30 + entry.nameBuf.length + padLen);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(entry.versionNeeded, 4);
    lfh.writeUInt16LE(entry.flags, 6);
    lfh.writeUInt16LE(entry.compressionMethod, 8);
    lfh.writeUInt16LE(entry.modTime, 10);
    lfh.writeUInt16LE(entry.modDate, 12);
    lfh.writeUInt32LE(entry.crc32, 14);
    lfh.writeUInt32LE(entry.compressedSize, 18);
    lfh.writeUInt32LE(entry.uncompressedSize, 22);
    lfh.writeUInt16LE(entry.nameBuf.length, 26);
    lfh.writeUInt16LE(padLen, 28);
    entry.nameBuf.copy(lfh, 30);

    const localOffset = offset;
    localParts.push(lfh, entry.compressedData);
    offset += lfh.length + entry.compressedData.length;

    const cdh = Buffer.alloc(46 + entry.nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(entry.versionMadeBy, 4);
    cdh.writeUInt16LE(entry.versionNeeded, 6);
    cdh.writeUInt16LE(entry.flags, 8);
    cdh.writeUInt16LE(entry.compressionMethod, 10);
    cdh.writeUInt16LE(entry.modTime, 12);
    cdh.writeUInt16LE(entry.modDate, 14);
    cdh.writeUInt32LE(entry.crc32, 16);
    cdh.writeUInt32LE(entry.compressedSize, 20);
    cdh.writeUInt32LE(entry.uncompressedSize, 24);
    cdh.writeUInt16LE(entry.nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra len
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34); // disk start
    cdh.writeUInt16LE(entry.internalAttr, 36);
    cdh.writeUInt32LE(entry.externalAttr, 38);
    cdh.writeUInt32LE(localOffset, 42);
    entry.nameBuf.copy(cdh, 46);
    cdParts.push(cdh);
  }

  const section1 = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(cdParts);

  const eocdWithoutCdOffset = Buffer.alloc(22);
  eocdWithoutCdOffset.writeUInt32LE(0x06054b50, 0);
  eocdWithoutCdOffset.writeUInt16LE(0, 4);
  eocdWithoutCdOffset.writeUInt16LE(0, 6);
  eocdWithoutCdOffset.writeUInt16LE(entries.length, 8);
  eocdWithoutCdOffset.writeUInt16LE(entries.length, 10);
  eocdWithoutCdOffset.writeUInt32LE(centralDirectory.length, 12);
  eocdWithoutCdOffset.writeUInt32LE(section1.length, 16);
  eocdWithoutCdOffset.writeUInt16LE(0, 20);

  return {section1, centralDirectory, eocdWithoutCdOffset};
}

function lengthPrefixed(buf: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

function computeApkV2Sha256Digest(section1: Buffer, section3: Buffer, section4: Buffer): Buffer {
  const CHUNK_SIZE = 1024 * 1024;
  const chunkDigests: Buffer[] = [];

  for (const section of [section1, section3, section4]) {
    const chunkCount = Math.max(1, Math.ceil(section.length / CHUNK_SIZE));
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = section.subarray(start, Math.min(section.length, start + CHUNK_SIZE));
      const header = Buffer.alloc(5);
      header[0] = 0xa5;
      header.writeUInt32LE(chunk.length, 1);
      const digest = crypto.createHash('sha256').update(header).update(chunk).digest();
      chunkDigests.push(digest);
    }
  }

  const topHeader = Buffer.alloc(5);
  topHeader[0] = 0x5a;
  topHeader.writeUInt32LE(chunkDigests.length, 1);
  const finalHash = crypto.createHash('sha256').update(topHeader);
  for (const d of chunkDigests) {
    finalHash.update(d);
  }
  return finalHash.digest();
}

function pemCertToDer(certPem: string): Buffer {
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(b64, 'base64');
}

function signApkV2(
  section1: Buffer,
  centralDirectory: Buffer,
  eocdForDigest: Buffer,
  privateKeyPem: string,
  certPem: string,
): Buffer {
  // APK Signature Scheme v2 algorithm ID 0x0103: RSASSA-PKCS1-v1_5 with SHA-256
  const SIG_ALGO_RSA_PKCS1_SHA256 = 0x0103;
  const APK_SIG_SCHEME_V2_BLOCK_ID = 0x7109871a;

  const contentDigest = computeApkV2Sha256Digest(section1, centralDirectory, eocdForDigest);

  // digests sequence: [ length-prefixed (uint32 algoId + length-prefixed digest) ]
  const digestAlgoBuf = Buffer.alloc(4);
  digestAlgoBuf.writeUInt32LE(SIG_ALGO_RSA_PKCS1_SHA256, 0);
  const digestEntry = lengthPrefixed(Buffer.concat([digestAlgoBuf, lengthPrefixed(contentDigest)]));
  const digestsSeq = lengthPrefixed(digestEntry);

  // certificates sequence: [ length-prefixed X.509 DER cert ]
  const certDer = pemCertToDer(certPem);
  const certsSeq = lengthPrefixed(lengthPrefixed(certDer));

  // additional attributes sequence (empty)
  const additionalAttrsSeq = lengthPrefixed(Buffer.alloc(0));

  // signedData = digests + certificates + additionalAttributes
  const signedData = Buffer.concat([digestsSeq, certsSeq, additionalAttrsSeq]);

  // Sign signedData with RSASSA-PKCS1-v1_5 + SHA-256
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signedData);
  const signatureBytes = signer.sign(privateKeyPem);

  const sigEntry = lengthPrefixed(Buffer.concat([digestAlgoBuf, lengthPrefixed(signatureBytes)]));
  const signaturesSeq = lengthPrefixed(sigEntry);

  // SubjectPublicKeyInfo DER bytes of the public key
  const pubKeyDer = crypto
    .createPublicKey(privateKeyPem)
    .export({type: 'spki', format: 'der'}) as Buffer;

  // signer = length-prefixed signedData + signaturesSeq + length-prefixed publicKey
  const signerBlock = lengthPrefixed(
    Buffer.concat([lengthPrefixed(signedData), signaturesSeq, lengthPrefixed(pubKeyDer)]),
  );

  // v2 block value = length-prefixed sequence of signers
  const v2Value = lengthPrefixed(signerBlock);

  // APK Signing Block pair: uint64le(4 + v2Value.length) + uint32le(0x7109871a) + v2Value
  const pairLen = Buffer.alloc(8);
  pairLen.writeBigUInt64LE(BigInt(4 + v2Value.length), 0);
  const pairId = Buffer.alloc(4);
  pairId.writeUInt32LE(APK_SIG_SCHEME_V2_BLOCK_ID, 0);
  const pairBlock = Buffer.concat([pairLen, pairId, v2Value]);

  // Pad to 4096-byte multiple (clean standard practice) using Verity padding block ID 0x42726577 if desired
  const magic = Buffer.from('APK Sig Block 42', 'ascii');
  // Block layout: uint64le(sizeOfBlock) + pairs + uint64le(sizeOfBlock) + magic(16)
  const sizeOfBlock = BigInt(pairBlock.length + 8 + 16);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeBigUInt64LE(sizeOfBlock, 0);

  const apkSigningBlock = Buffer.concat([sizeBuf, pairBlock, sizeBuf, magic]);

  // Update EOCD cdOffset to point past the APK Signing Block
  const finalEocd = Buffer.from(eocdForDigest);
  finalEocd.writeUInt32LE(section1.length + apkSigningBlock.length, 16);

  return Buffer.concat([section1, apkSigningBlock, centralDirectory, finalEocd]);
}

const stampedApkCache = new Map<string, Buffer>();

export function buildSignedAndroidApkForUrl(opts: {
  rootDir: string;
  targetUrl: string;
}): Buffer | null {
  const cleanUrl = opts.targetUrl.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+/i.test(cleanUrl)) {
    return null;
  }

  const cached = stampedApkCache.get(cleanUrl);
  if (cached) return cached;

  const baseApkPath = path.join(opts.rootDir, 'public', 'downloads', 'mega-achados-027.apk');
  if (!fs.existsSync(baseApkPath)) return null;

  const keyPem =
    process.env.APK_SIGNING_KEY_PEM ||
    (fs.existsSync(path.join(opts.rootDir, 'android-apk', 'release-key.pem'))
      ? fs.readFileSync(path.join(opts.rootDir, 'android-apk', 'release-key.pem'), 'utf8')
      : '');
  const certPem =
    process.env.APK_SIGNING_CERT_PEM ||
    (fs.existsSync(path.join(opts.rootDir, 'android-apk', 'release-cert.pem'))
      ? fs.readFileSync(path.join(opts.rootDir, 'android-apk', 'release-cert.pem'), 'utf8')
      : '');

  if (!keyPem || !certPem) {
    return fs.readFileSync(baseApkPath);
  }

  const rawApk = fs.readFileSync(baseApkPath);
  // Strip existing META-INF signature entries so v2 signature is completely clean & consistent
  const entries = parseZipEntries(rawApk).filter(
    (e) => !e.name.toUpperCase().startsWith('META-INF/'),
  );

  const urlBytes = Buffer.from(`${cleanUrl}\n`, 'utf8');
  const urlCrc = computeCrc32(urlBytes);
  const existingIdx = entries.findIndex((e) => e.name === 'assets/app_url.txt');
  const urlEntry: ZipEntry = {
    name: 'assets/app_url.txt',
    nameBuf: Buffer.from('assets/app_url.txt', 'utf8'),
    compressionMethod: 0, // stored uncompressed & 4-byte aligned
    crc32: urlCrc,
    compressedSize: urlBytes.length,
    uncompressedSize: urlBytes.length,
    modTime: 0,
    modDate: 0x5421,
    flags: 0,
    versionMadeBy: 20,
    versionNeeded: 20,
    internalAttr: 0,
    externalAttr: 0,
    compressedData: urlBytes,
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = urlEntry;
  } else {
    entries.push(urlEntry);
  }

  const {section1, centralDirectory, eocdWithoutCdOffset} = buildAlignedZipParts(entries);
  const signedApk = signApkV2(section1, centralDirectory, eocdWithoutCdOffset, keyPem, certPem);

  if (stampedApkCache.size > 20) {
    const firstKey = stampedApkCache.keys().next().value;
    if (firstKey) stampedApkCache.delete(firstKey);
  }
  stampedApkCache.set(cleanUrl, signedApk);
  return signedApk;
}
