import "server-only";

import { resolve4 } from "node:dns/promises";
import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";

import { COURSE_HOSTNAME } from "./bootstrap-profile";

const PROBE_TIMEOUT_MS = 5_000;

export class ExternalHealthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "ExternalHealthError";
  }
}

type ExternalHealthDependencies = Readonly<{
  resolveIpv4(hostname: string): Promise<string[]>;
  isPortOpen(address: string, port: number): Promise<boolean>;
  tlsFingerprint(hostname: string): Promise<string | null>;
  fetchImpl: typeof fetch;
}>;

async function defaultPortProbe(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectTcp({ host: address, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function defaultTlsProbe(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connectTls({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: true,
    });
    const finish = (result: string | null) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(null));
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      finish(socket.authorized ? certificate.fingerprint256 ?? null : null);
    });
    socket.once("error", () => finish(null));
  });
}

const defaultDependencies: ExternalHealthDependencies = {
  resolveIpv4: resolve4,
  isPortOpen: defaultPortProbe,
  tlsFingerprint: defaultTlsProbe,
  fetchImpl: fetch,
};

export class ExternalEnvironmentVerifier {
  constructor(
    private readonly dependencies: ExternalHealthDependencies =
      defaultDependencies,
  ) {}

  async verifyBootstrapReachable(expectedIpv4: string): Promise<void> {
    if (!(await this.dependencies.isPortOpen(expectedIpv4, 80))) {
      throw new ExternalHealthError(
        "BOOTSTRAP_NOT_READY",
        "VPS ещё не принимает соединения на публичном порту 80.",
      );
    }
  }

  async verifyDns(expectedIpv4: string): Promise<void> {
    let addresses: string[];
    try {
      addresses = await this.dependencies.resolveIpv4(COURSE_HOSTNAME);
    } catch {
      throw new ExternalHealthError(
        "DNS_NOT_READY",
        "Публичный DNS ещё не разрешает approved hostname.",
      );
    }
    if (
      addresses.length !== 1 ||
      addresses[0] !== expectedIpv4
    ) {
      throw new ExternalHealthError(
        "DNS_NOT_READY",
        "Публичный A record ещё не совпадает с owned floating IP.",
      );
    }
  }

  async verifyTlsAndPorts(expectedIpv4: string): Promise<string> {
    const [httpOpen, httpsOpen, n8nOpen, postgresOpen] = await Promise.all([
      this.dependencies.isPortOpen(expectedIpv4, 80),
      this.dependencies.isPortOpen(expectedIpv4, 443),
      this.dependencies.isPortOpen(expectedIpv4, 5_678),
      this.dependencies.isPortOpen(expectedIpv4, 5_432),
    ]);
    if (!httpOpen || !httpsOpen) {
      throw new ExternalHealthError(
        "TLS_NOT_READY",
        "Публичные порты 80/443 ещё не готовы.",
      );
    }
    if (n8nOpen || postgresOpen) {
      throw new ExternalHealthError(
        "UNSAFE_PUBLIC_PORT",
        "n8n или PostgreSQL опубликован наружу.",
        false,
      );
    }
    const fingerprint =
      await this.dependencies.tlsFingerprint(COURSE_HOSTNAME);
    if (!fingerprint) {
      throw new ExternalHealthError(
        "TLS_NOT_READY",
        "Валидный TLS certificate для approved hostname ещё не выдан.",
      );
    }
    return fingerprint;
  }

  async verifyN8nHealth(): Promise<void> {
    const request = async (pathname: string, init?: RequestInit) => {
      try {
        return await this.dependencies.fetchImpl(
          `https://${COURSE_HOSTNAME}${pathname}`,
          {
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            ...init,
          },
        );
      } catch {
        throw new ExternalHealthError(
          "HEALTH_NOT_READY",
          "HTTPS endpoint n8n ещё недоступен.",
        );
      }
    };
    const health = await request("/healthz");
    if (health.status !== 200) {
      throw new ExternalHealthError(
        "HEALTH_NOT_READY",
        "n8n /healthz ещё не вернул 200.",
      );
    }
    // ADR-0016: ученик входит по собственному аккаунту, поэтому форма входа
    // n8n доступна публично. Проверяем не закрытость редактора, а то, что он
    // отвечает: `manual` нужен, потому что n8n перенаправляет корень на /signin.
    const editor = await request("/", { redirect: "manual" });
    const editorReachable =
      editor.status === 200 || (editor.status >= 300 && editor.status < 400);
    if (!editorReachable) {
      throw new ExternalHealthError(
        "HEALTH_NOT_READY",
        "n8n editor ещё не отвечает на публичный HTTPS-запрос.",
      );
    }

    // Управляющий API обязан оставаться закрытым: через него платформа
    // создаёт приглашения, и его открытость означала бы полный доступ к
    // инструменту без учётных данных.
    const management = await request("/api/v1/users", { redirect: "manual" });
    if (management.status !== 401) {
      throw new ExternalHealthError(
        "MANAGEMENT_API_NOT_SECURED",
        "Управляющий API n8n отвечает без обязательной авторизации.",
        false,
      );
    }
  }
}

export function createExternalEnvironmentVerifier(): ExternalEnvironmentVerifier {
  return new ExternalEnvironmentVerifier();
}
