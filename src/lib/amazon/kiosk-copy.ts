/** Fire kiosk strings, all 10 shipped locales. Plain object so node tests can import it. */
export type KioskCopy = {
  title: string;
  lead: string;
  checkIn: string;
  checkOut: string;
  pickup: string;
  exit: string;
  pin: string;
  setPin: string;
  wrongPin: string;
  help: string;
  helpBody: string;
  empty: string;
  done: string;
  preview: string;
};

export const KIOSK_COPY: Record<string, KioskCopy> = {
  en: { title: "Check-in desk", lead: "Tap a child to check them in or out.", checkIn: "Check in", checkOut: "Check out", pickup: "Picked up by", exit: "Exit kiosk", pin: "Staff PIN", setPin: "Set a 4–8 digit staff PIN to lock this tablet", wrongPin: "That PIN is not right.", help: "Help", helpBody: "Ask staff at the front desk. Staff can exit kiosk mode with the PIN.", empty: "No children booked today.", done: "Saved", preview: "Preview with sample children" },
  fr: { title: "Accueil des enfants", lead: "Touchez un enfant pour son arrivée ou son départ.", checkIn: "Arrivée", checkOut: "Départ", pickup: "Récupéré par", exit: "Quitter le kiosque", pin: "NIP du personnel", setPin: "Choisissez un NIP de 4 à 8 chiffres pour verrouiller la tablette", wrongPin: "Ce NIP est incorrect.", help: "Aide", helpBody: "Demandez au personnel à l’accueil. Le personnel peut quitter le kiosque avec le NIP.", empty: "Aucun enfant réservé aujourd’hui.", done: "Enregistré", preview: "Aperçu avec des enfants fictifs" },
  zh: { title: "签到台", lead: "点击孩子进行签到或签退。", checkIn: "签到", checkOut: "签退", pickup: "接送人", exit: "退出自助模式", pin: "员工密码", setPin: "设置 4–8 位员工密码以锁定平板", wrongPin: "密码不正确。", help: "帮助", helpBody: "请询问前台员工。员工可用密码退出自助模式。", empty: "今天没有预约的孩子。", done: "已保存", preview: "示例数据预览" },
  yue: { title: "簽到枱", lead: "撳小朋友嚟簽到或者簽走。", checkIn: "簽到", checkOut: "簽走", pickup: "接走嘅人", exit: "退出自助模式", pin: "職員密碼", setPin: "設定 4–8 位職員密碼鎖住平板", wrongPin: "密碼唔啱。", help: "幫助", helpBody: "請問前枱職員。職員可以用密碼退出。", empty: "今日冇預約嘅小朋友。", done: "已儲存", preview: "示例資料預覽" },
  pa: { title: "ਚੈੱਕ-ਇਨ ਡੈਸਕ", lead: "ਬੱਚੇ ਨੂੰ ਚੈੱਕ-ਇਨ ਜਾਂ ਚੈੱਕ-ਆਊਟ ਕਰਨ ਲਈ ਛੂਹੋ।", checkIn: "ਚੈੱਕ-ਇਨ", checkOut: "ਚੈੱਕ-ਆਊਟ", pickup: "ਲੈਣ ਵਾਲਾ", exit: "ਕਿਓਸਕ ਤੋਂ ਬਾਹਰ", pin: "ਸਟਾਫ PIN", setPin: "ਟੈਬਲੇਟ ਲੌਕ ਕਰਨ ਲਈ 4–8 ਅੰਕਾਂ ਦਾ PIN ਬਣਾਓ", wrongPin: "PIN ਗਲਤ ਹੈ।", help: "ਮਦਦ", helpBody: "ਫਰੰਟ ਡੈਸਕ ਸਟਾਫ ਨੂੰ ਪੁੱਛੋ।", empty: "ਅੱਜ ਕੋਈ ਬੱਚਾ ਬੁੱਕ ਨਹੀਂ।", done: "ਸੰਭਾਲਿਆ", preview: "ਨਮੂਨਾ ਡਾਟਾ" },
  es: { title: "Registro de llegada", lead: "Toca a un niño para registrar entrada o salida.", checkIn: "Entrada", checkOut: "Salida", pickup: "Recogido por", exit: "Salir del quiosco", pin: "PIN del personal", setPin: "Crea un PIN de 4 a 8 dígitos para bloquear la tableta", wrongPin: "PIN incorrecto.", help: "Ayuda", helpBody: "Pregunta al personal de recepción. El personal sale del quiosco con el PIN.", empty: "No hay niños reservados hoy.", done: "Guardado", preview: "Vista previa con datos de ejemplo" },
  ar: { title: "مكتب تسجيل الحضور", lead: "اضغط على الطفل لتسجيل الدخول أو الخروج.", checkIn: "دخول", checkOut: "خروج", pickup: "استلمه", exit: "الخروج من الكشك", pin: "رمز الموظفين", setPin: "عيّن رمزًا من 4 إلى 8 أرقام لقفل الجهاز", wrongPin: "الرمز غير صحيح.", help: "مساعدة", helpBody: "اسأل الموظفين في الاستقبال.", empty: "لا يوجد أطفال محجوزون اليوم.", done: "تم الحفظ", preview: "معاينة ببيانات تجريبية" },
  tl: { title: "Check-in desk", lead: "I-tap ang bata para i-check in o out.", checkIn: "Check in", checkOut: "Check out", pickup: "Sinundo ni", exit: "Lumabas sa kiosk", pin: "Staff PIN", setPin: "Magtakda ng 4–8 digit na PIN para i-lock ang tablet", wrongPin: "Mali ang PIN.", help: "Tulong", helpBody: "Magtanong sa staff sa front desk.", empty: "Walang batang naka-book ngayon.", done: "Na-save", preview: "Preview na may sample" },
  it: { title: "Accoglienza", lead: "Tocca un bambino per registrare entrata o uscita.", checkIn: "Entrata", checkOut: "Uscita", pickup: "Ritirato da", exit: "Esci dal chiosco", pin: "PIN del personale", setPin: "Imposta un PIN di 4–8 cifre per bloccare il tablet", wrongPin: "PIN errato.", help: "Aiuto", helpBody: "Chiedi al personale all’ingresso.", empty: "Nessun bambino prenotato oggi.", done: "Salvato", preview: "Anteprima con dati di esempio" },
  de: { title: "Anmeldung", lead: "Tippe auf ein Kind zum An- oder Abmelden.", checkIn: "Anmelden", checkOut: "Abmelden", pickup: "Abgeholt von", exit: "Kiosk beenden", pin: "Personal-PIN", setPin: "Lege eine 4–8-stellige PIN fest, um das Tablet zu sperren", wrongPin: "Falsche PIN.", help: "Hilfe", helpBody: "Frag das Personal am Empfang.", empty: "Heute keine Kinder gebucht.", done: "Gespeichert", preview: "Vorschau mit Beispieldaten" },
};

export function kioskCopy(locale: string): KioskCopy {
  return KIOSK_COPY[locale] || KIOSK_COPY.en;
}

export const KIOSK_SAMPLE = [
  { bookingId: "sample-1", childName: "Sample child A", daycareName: "Sample daycare", next: "check_in" as const, pickups: [] as string[] },
  { bookingId: "sample-2", childName: "Sample child B", daycareName: "Sample daycare", next: "check_out" as const, pickups: ["Parent 1", "Parent 2"] },
  { bookingId: "sample-3", childName: "Sample child C", daycareName: "Sample daycare", next: "check_in" as const, pickups: [] as string[] },
  { bookingId: "sample-4", childName: "Sample child D", daycareName: "Sample daycare", next: "check_out" as const, pickups: ["Parent 1"] },
];

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`kidease-kiosk:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
