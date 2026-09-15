import type { LucideIcon } from "lucide-react";
import {
  Baby,
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CircleHelp,
  CircleUser,
  ClipboardCheck,
  Columns2,
  Compass,
  Cookie,
  FileText,
  Heart,
  HeartHandshake,
  HelpCircle,
  Info,
  Landmark,
  Languages,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sprout,
  Star,
  Trash2,
  User,
  Users,
} from "lucide-react";

export type MenuIconId =
  | "explore"
  | "saved"
  | "parent"
  | "daycare"
  | "messages"
  | "notifications"
  | "account"
  | "profile"
  | "settings"
  | "help"
  | "language"
  | "login"
  | "logout"
  | "admin"
  | "support"
  | "compare"
  | "benefits"
  | "getApp"
  | "about"
  | "donate"
  | "team"
  | "contact"
  | "share"
  | "rate"
  | "claim"
  | "jobs"
  | "faq"
  | "howItWorks"
  | "privacy"
  | "terms"
  | "cookies"
  | "deleteAccount"
  | "tourChecklist"
  | "verify"
  | "startDaycare"
  | "appearance";

export const MENU_ICONS: Record<MenuIconId, LucideIcon> = {
  explore: Compass,
  saved: Heart,
  parent: Baby,
  daycare: Building2,
  messages: MessageCircle,
  notifications: Bell,
  account: CircleUser,
  profile: User,
  settings: Settings,
  help: CircleHelp,
  language: Languages,
  login: LogIn,
  logout: LogOut,
  admin: Shield,
  support: Users,
  compare: Columns2,
  benefits: Landmark,
  getApp: Smartphone,
  about: Info,
  donate: HeartHandshake,
  team: Users,
  contact: Mail,
  share: Share2,
  rate: Star,
  claim: BadgeCheck,
  jobs: Briefcase,
  faq: HelpCircle,
  howItWorks: BookOpen,
  privacy: ShieldCheck,
  terms: FileText,
  cookies: Cookie,
  deleteAccount: Trash2,
  tourChecklist: ClipboardCheck,
  verify: ShieldCheck,
  startDaycare: Sprout,
  appearance: Palette,
};

export function menuIcon(id: MenuIconId): LucideIcon {
  return MENU_ICONS[id];
}
