import dns from "node:dns/promises";
import net from "node:net";
import { getConfig } from "../config";
import { ProviderError } from "../providers/base/errors";

const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".localhost", ".internal"];

const normalizeHostname = (value: string) =>
  value.trim().replace(/^\[|\]$/g, "").toLowerCase();

const parseIpv4Octets = (value: string) => {
  const octets = value.split(".").map((segment) => Number(segment));
  if (
    octets.length !== 4 ||
    octets.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)
  ) {
    return null;
  }

  return octets as [number, number, number, number];
};

const isBlockedIpv4Address = (value: string) => {
  const octets = parseIpv4Octets(value);
  if (!octets) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const isDevelopmentFakeIpv4Address = (value: string) => {
  const octets = parseIpv4Octets(value);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;
  return a === 198 && (b === 18 || b === 19);
};

const isBlockedIpv6Address = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith(IPV4_MAPPED_IPV6_PREFIX)) {
    return isBlockedIpv4Address(normalized.slice(IPV4_MAPPED_IPV6_PREFIX.length));
  }

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  );
};

const isBlockedIpAddress = (value: string) => {
  const normalized = normalizeHostname(value);
  const family = net.isIP(normalized);
  if (family === 4) {
    return isBlockedIpv4Address(normalized);
  }
  if (family === 6) {
    return isBlockedIpv6Address(normalized);
  }
  return true;
};

const isDevelopmentFakeIpAddress = (value: string) => {
  const normalized = normalizeHostname(value);
  const family = net.isIP(normalized);
  if (family === 4) {
    return isDevelopmentFakeIpv4Address(normalized);
  }

  if (family === 6 && normalized.startsWith(IPV4_MAPPED_IPV6_PREFIX)) {
    return isDevelopmentFakeIpv4Address(normalized.slice(IPV4_MAPPED_IPV6_PREFIX.length));
  }

  return false;
};

const resolveHostnameAddresses = async (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  if (net.isIP(normalized)) {
    return [normalized];
  }

  try {
    const records = await dns.lookup(normalized, {
      all: true,
      verbatim: true,
    });
    return Array.from(new Set(records.map((record) => normalizeHostname(record.address))));
  } catch (error) {
    throw new ProviderError("Reference image URL could not be resolved.", 400, error);
  }
};

export const assertSafeRemoteUrl = async (value: string, label: string) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch (error) {
    throw new ProviderError(`${label} URL is invalid.`, 400, error);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ProviderError(`${label} URL must use HTTP or HTTPS.`, 400);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new ProviderError(`${label} URL must not include credentials.`, 400);
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (
    !hostname ||
    hostname === "localhost" ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new ProviderError(`${label} URL host is not allowed.`, 400);
  }

  const addresses = await resolveHostnameAddresses(hostname);
  if (addresses.length === 0) {
    throw new ProviderError(`${label} URL could not be resolved.`, 400);
  }

  const effectiveAddresses =
    getConfig().nodeEnv === "development" && !net.isIP(hostname)
      ? addresses.filter((address) => !isDevelopmentFakeIpAddress(address))
      : addresses;

  if (effectiveAddresses.length === 0) {
    return parsedUrl;
  }

  if (effectiveAddresses.some((address) => isBlockedIpAddress(address))) {
    throw new ProviderError(
      `${label} URL points to a private or reserved network address.`,
      400
    );
  }

  return parsedUrl;
};
