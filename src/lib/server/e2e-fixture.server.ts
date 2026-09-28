import { getRequest } from "@tanstack/react-start/server";
import { loopbackHost } from "@/lib/e2e-role-cookie";

/** Mock Checkout URL. Not a live charge. Only returned on loopback when the fixture env is set. */
export const E2E_CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_e2e_mock";

export function e2eLoopbackFixture(host: string): boolean {
  return process.env.E2E_ROLE_FIXTURE === "1" && loopbackHost(host);
}

export function e2eLoopbackFixtureRequest(request?: Request | null): boolean {
  const host = request?.headers.get("x-forwarded-host") || request?.headers.get("host") || "";
  return e2eLoopbackFixture(host);
}

export function e2eCheckoutMock(): boolean {
  try {
    return e2eLoopbackFixtureRequest(getRequest());
  } catch {
    return false;
  }
}
