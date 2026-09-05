export const CSP_SCRIPT_HOSTS: string[];
export const CSP_CONNECT_HOSTS: string[];
export const CSP_FRAME_HOSTS: string[];
export function generateNonce(): string;
export function buildContentSecurityPolicy(nonce: string): string;
export function applyScriptNonces(html: string, nonce: string): string;
export function isHtmlResponse(contentType: string | null | undefined): boolean;
