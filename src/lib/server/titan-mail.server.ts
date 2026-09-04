import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import {
  buildOutgoingMail,
  humanTitanError,
  imapAppendSent,
  imapFetchList,
  imapFetchUid,
  imapLogin,
  imapLogout,
  imapSelectInbox,
  parseSmtpReplyBlock,
  resolveTitanConfig,
  smtpTransaction,
  type BuiltMail,
  type ImapIo,
  type SmtpIo,
  type TitanListItem,
  type TitanMailConfig,
  type TitanMessage,
} from "@/lib/server/titan-mail";

const SOCKET_MS = 12_000;
const MAX_LITERAL = 800_000;

type NodeSock = Socket | TLSSocket;

class LineBuf {
  private buf = Buffer.alloc(0);
  private wait: ((err: Error | null) => void) | null = null;
  private sock: NodeSock;

  constructor(sock: NodeSock) {
    this.sock = sock;
    this.bind(sock);
  }

  private onData = (chunk: Buffer | string) => {
    this.buf = Buffer.concat([this.buf, Buffer.from(chunk)]);
    this.notify(null);
  };
  private onError = (err: Error) => this.notify(err);
  private onEnd = () => this.notify(new Error("Titan closed the connection."));
  private onTimeout = () => {
    this.sock.destroy();
    this.notify(new Error("Titan connection timed out"));
  };

  private bind(sock: NodeSock) {
    sock.on("data", this.onData);
    sock.on("error", this.onError);
    sock.on("end", this.onEnd);
    sock.on("timeout", this.onTimeout);
    sock.setTimeout(SOCKET_MS);
  }

  private unbind() {
    this.sock.off("data", this.onData);
    this.sock.off("error", this.onError);
    this.sock.off("end", this.onEnd);
    this.sock.off("timeout", this.onTimeout);
  }

  attach(sock: NodeSock) {
    this.unbind();
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.bind(sock);
  }

  private notify(err: Error | null) {
    const wait = this.wait;
    this.wait = null;
    wait?.(err);
  }

  private more(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wait = (err) => {
        if (err) reject(err);
        else resolve();
      };
    });
  }

  async readLine(): Promise<string> {
    while (true) {
      const idx = this.buf.indexOf(0x0a);
      if (idx >= 0) {
        const line = this.buf.subarray(0, idx).toString("utf8").replace(/\r$/, "");
        this.buf = this.buf.subarray(idx + 1);
        return line;
      }
      await this.more();
    }
  }

  async readBytes(n: number): Promise<Buffer> {
    if (n > MAX_LITERAL) throw new Error("That Titan message is too large to open in KidEase. Use Open Titan inbox.");
    while (this.buf.length < n) await this.more();
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  write(data: string | Buffer) {
    this.sock.write(data);
  }
}

function connectTls(host: string, port: number, socket?: Socket): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const sock = tlsConnect(
      {
        host,
        port,
        servername: host,
        socket,
        timeout: SOCKET_MS,
      },
      () => resolve(sock),
    );
    sock.on("error", reject);
    sock.on("timeout", () => {
      sock.destroy();
      reject(new Error("Titan connection timed out"));
    });
  });
}

function connectTcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = netConnect({ host, port }, () => resolve(sock));
    sock.setTimeout(SOCKET_MS);
    sock.on("error", reject);
    sock.on("timeout", () => {
      sock.destroy();
      reject(new Error("Titan connection timed out"));
    });
  });
}

async function readLogical(buf: LineBuf): Promise<{ text: string; literals: string[] }> {
  const literals: string[] = [];
  let text = "";
  while (true) {
    const line = await buf.readLine();
    const m = line.match(/^(.*)\{(\d+)\}\s*$/);
    if (!m) {
      text += line;
      return { text, literals };
    }
    text += `${m[1]}{${literals.length}}`;
    const bytes = await buf.readBytes(Number(m[2]));
    literals.push(bytes.toString("utf8"));
  }
}

function imapIo(buf: LineBuf): ImapIo {
  return {
    writeLine(line) {
      buf.write(`${line}\r\n`);
    },
    writeRaw(data) {
      buf.write(data);
    },
    readLogical: () => readLogical(buf),
  };
}

function smtpIo(buf: LineBuf): SmtpIo {
  return {
    writeLine(line) {
      buf.write(`${line}\r\n`);
    },
    writeRaw(data) {
      buf.write(data);
    },
    async readReply() {
      const lines: string[] = [];
      while (true) {
        const line = await buf.readLine();
        lines.push(line);
        const m = line.match(/^(\d{3})([ -])/);
        if (m && m[2] === " ") return parseSmtpReplyBlock(lines);
      }
    },
  };
}

function requireConfig(): TitanMailConfig {
  const resolved = resolveTitanConfig();
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.config;
}

export async function listTitanInbox(limit = 40): Promise<TitanListItem[]> {
  const cfg = requireConfig();
  const sock = await connectTls(cfg.imapHost, cfg.imapPort);
  const buf = new LineBuf(sock);
  const io = imapIo(buf);
  try {
    const greet = await buf.readLine();
    if (!/^\* OK/i.test(greet)) throw new Error("Titan IMAP did not greet.");
    await imapLogin(io, cfg.user, cfg.password);
    const exists = await imapSelectInbox(io);
    return await imapFetchList(io, exists, limit);
  } catch (err) {
    throw new Error(humanTitanError(err, cfg.password));
  } finally {
    try {
      await imapLogout(io);
    } catch {
      // ignore
    }
    sock.destroy();
  }
}

export async function getTitanMessage(uid: number): Promise<TitanMessage> {
  const cfg = requireConfig();
  const sock = await connectTls(cfg.imapHost, cfg.imapPort);
  const buf = new LineBuf(sock);
  const io = imapIo(buf);
  try {
    const greet = await buf.readLine();
    if (!/^\* OK/i.test(greet)) throw new Error("Titan IMAP did not greet.");
    await imapLogin(io, cfg.user, cfg.password);
    await imapSelectInbox(io);
    return await imapFetchUid(io, uid);
  } catch (err) {
    throw new Error(humanTitanError(err, cfg.password));
  } finally {
    try {
      await imapLogout(io);
    } catch {
      // ignore
    }
    sock.destroy();
  }
}

export async function sendTitanMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ ok: true; via: "titan"; copiedToSent: boolean }> {
  const cfg = requireConfig();
  const mail = buildOutgoingMail({
    fromHeader: cfg.fromHeader,
    fromEmail: cfg.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });
  await smtpSend(cfg, mail);
  let copiedToSent = false;
  try {
    await appendSentCopy(cfg, mail.raw);
    copiedToSent = true;
  } catch {
    copiedToSent = false;
  }
  return { ok: true, via: "titan", copiedToSent };
}

async function smtpSend(cfg: TitanMailConfig, mail: BuiltMail) {
  let sock: NodeSock | null = null;
  let buf: LineBuf | null = null;
  try {
    if (cfg.smtpSecure) {
      sock = await connectTls(cfg.smtpHost, cfg.smtpPort);
      buf = new LineBuf(sock);
      await smtpTransaction(smtpIo(buf), {
        user: cfg.user,
        password: cfg.password,
        fromEmail: cfg.fromEmail,
        to: mail.to,
        raw: mail.raw,
        alreadySecure: true,
      });
      return;
    }
    sock = await connectTcp(cfg.smtpHost, cfg.smtpPort);
    buf = new LineBuf(sock);
    await smtpTransaction(smtpIo(buf), {
      user: cfg.user,
      password: cfg.password,
      fromEmail: cfg.fromEmail,
      to: mail.to,
      raw: mail.raw,
      alreadySecure: false,
      startTls: async () => {
        const upgraded = await connectTls(cfg.smtpHost, cfg.smtpPort, sock as Socket);
        sock = upgraded;
        buf?.attach(upgraded);
      },
    });
  } catch (err) {
    throw new Error(humanTitanError(err, cfg.password));
  } finally {
    sock?.destroy();
  }
}

async function appendSentCopy(cfg: TitanMailConfig, raw: string) {
  const sock = await connectTls(cfg.imapHost, cfg.imapPort);
  const buf = new LineBuf(sock);
  const io = imapIo(buf);
  try {
    const greet = await buf.readLine();
    if (!/^\* OK/i.test(greet)) throw new Error("Titan IMAP did not greet.");
    await imapLogin(io, cfg.user, cfg.password);
    await imapAppendSent(io, raw);
    await imapLogout(io);
  } finally {
    sock.destroy();
  }
}
