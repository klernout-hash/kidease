import { useRoleChrome } from "@/components/role-chrome";
import { parentCompareMax, parentPlusFeaturesOpen, showParentUpgradeCta } from "@/lib/parent-plus-access";

/** Server flag from role chrome. The browser does not read SUBSCRIPTIONS_ENABLED. */
export function useParentPlusAccess() {
  const chrome = useRoleChrome();
  const input = {
    subscriptionsOn: chrome.subscriptionsEnabled,
    role: chrome.role,
    paid: chrome.paid,
  };
  return {
    subscriptionsOn: chrome.subscriptionsEnabled,
    plusOpen: parentPlusFeaturesOpen(input),
    compareMax: parentCompareMax(input),
    showParentUpgrade: showParentUpgradeCta(chrome.subscriptionsEnabled),
  };
}
