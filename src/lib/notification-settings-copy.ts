export type NotificationSettingsCopy = {
  title: string;
  lead: string;
  linkAria: string;
  back: string;
  signIn: string;
  emailTopics: string;
};

const EN: NotificationSettingsCopy = {
  title: "Notification settings",
  lead: "Choose which alerts you get and how: in the app, by email, or by push. Your alerts stay under the bell.",
  linkAria: "Open notification settings in the Menu",
  back: "Menu",
  signIn: "Sign in to change your notification settings.",
  emailTopics: "Email topics",
};

const FR: NotificationSettingsCopy = {
  title: "Paramètres des notifications",
  lead: "Choisissez les alertes que vous recevez et comment : dans l’appli, par courriel ou par notification poussée. Vos alertes restent sous la cloche.",
  linkAria: "Ouvrir les paramètres des notifications dans le menu",
  back: "Menu",
  signIn: "Connectez-vous pour modifier vos paramètres de notification.",
  emailTopics: "Sujets des courriels",
};

export function notificationSettingsCopy(locale: string | null | undefined): NotificationSettingsCopy {
  return locale === "fr" ? FR : EN;
}
