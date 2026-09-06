import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { friendlyResetMailError } from "../src/lib/auth/reset-errors.ts";
import {
  RESET_MAIL_NOT_CONFIGURED,
  assertResetMailConfigured,
  resetMailConfigured,
} from "../src/lib/server/reset-mail-config.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("forgot-password flow", () => {
  it("wires Better Auth sendResetPassword instead of enabled-only email/password", () => {
    const server = read("src/lib/auth/server.ts");
    const emailPassword = read("src/lib/auth/email-password.ts");
    assert.match(server, /emailAndPasswordConfig/);
    assert.match(server, /emailAndPassword:\s*emailAndPasswordConfig/);
    assert.doesNotMatch(server, /emailAndPassword:\s*\{\s*enabled:\s*true\s*\}/);
    assert.match(emailPassword, /sendResetPassword/);
    assert.match(emailPassword, /reset-mail/);
    assert.match(emailPassword, /resetPasswordTokenExpiresIn:\s*60 \* 60/);
  });

  it("registers /forgot-password so Production does not 404", () => {
    const routeFile = read("src/routes/forgot-password.tsx");
    const routeTree = read("src/routeTree.gen.ts");
    assert.match(routeFile, /createFileRoute\("\/forgot-password"\)/);
    assert.match(routeFile, /authClient\.forgetPassword/);
    assert.match(routeFile, /redirectTo:\s*"\/reset-password"/);
    assert.match(routeTree, /from '\.\/routes\/forgot-password'/);
    assert.match(routeTree, /id:\s*'\/forgot-password'/);
    assert.match(routeTree, /path:\s*'\/forgot-password'/);
    assert.match(routeTree, /fullPath:\s*'\/forgot-password'/);
    assert.match(routeTree, /ForgotPasswordRoute/);
  });

  it("login Forgot password is a real link to /forgot-password", () => {
    const login = read("src/routes/login.tsx");
    assert.match(login, /to="\/forgot-password"/);
    assert.match(login, /Forgot password\?/);
    assert.doesNotMatch(login, /setForgotOpen/);
    assert.doesNotMatch(login, /authClient\.forgetPassword/);
  });

  it("reset token page posts a new password and returns to login", () => {
    const reset = read("src/routes/reset-password.tsx");
    assert.match(reset, /createFileRoute\("\/reset-password"\)/);
    assert.match(reset, /authClient\.resetPassword/);
    assert.match(reset, /to="\/login"/);
    assert.match(reset, /Back to sign in/);
  });

  it("shows a password visibility toggle on login and reset forms", () => {
    const field = read("src/components/password-field.tsx");
    const login = read("src/routes/login.tsx");
    const reset = read("src/routes/reset-password.tsx");
    assert.match(field, /Show password/);
    assert.match(field, /Hide password/);
    assert.match(field, /EyeOff/);
    assert.match(login, /PasswordField/);
    assert.match(reset, /PasswordField/);
    assert.match(reset, /label="New password"/);
    assert.match(reset, /label="Confirm password"/);
  });

  it("refuses to pretend a reset email was sent when Resend/SendGrid are missing", () => {
    const mail = read("src/lib/server/reset-mail.ts");
    const config = read("src/lib/server/reset-mail-config.ts");
    const authApi = read("src/routes/api/auth/$.ts");
    assert.match(mail, /assertResetMailConfigured/);
    assert.match(mail, /RESEND_API_KEY/);
    assert.match(mail, /SENDGRID_API_KEY/);
    assert.match(config, /RESET_MAIL_NOT_CONFIGURED/);
    assert.doesNotMatch(mail, /kidease-reset/);
    assert.match(authApi, /assertResetMailConfigured/);
    assert.match(authApi, /\/forget-password/);
    assert.match(authApi, /status: 503/);
  });

  it("maps missing mail config to honest UI copy", () => {
    assert.match(
      friendlyResetMailError("Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY)"),
      /RESEND_API_KEY or SENDGRID_API_KEY/,
    );
    assert.match(friendlyResetMailError("Email could not be sent (401)."), /could not be sent/);
    assert.equal(friendlyResetMailError("Please complete the security check."), "Please complete the security check.");
  });

  it("treats blank Resend/SendGrid keys as not configured", () => {
    assert.equal(resetMailConfigured({}), false);
    assert.equal(resetMailConfigured({ RESEND_API_KEY: "  " }), false);
    assert.equal(resetMailConfigured({ RESEND_API_KEY: "re_test" }), true);
    assert.equal(resetMailConfigured({ SENDGRID_API_KEY: "sg_test" }), true);
    assert.throws(() => assertResetMailConfigured({}), { message: RESET_MAIL_NOT_CONFIGURED });
  });
});
