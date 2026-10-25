import type { ActivityLanguage } from "./activity-language";

type LoopLabels = {
  phase: [string, string, string, string];
  actions: string; verified: string; review: string; failed: string;
};
const LABELS: Record<ActivityLanguage, LoopLabels> = {
  en: { phase: ["Working", "Needs help", "You are in control", "Closed"], actions: "Actions", verified: "Observed progress", review: "Unverified", failed: "Failed" },
  vi: { phase: ["Đang làm", "Cần hỗ trợ", "Bạn đang điều khiển", "Đã đóng"], actions: "Thao tác", verified: "Có tiến triển", review: "Chưa xác minh", failed: "Lỗi" },
  es: { phase: ["Trabajando", "Necesita ayuda", "Control humano", "Cerrado"], actions: "Acciones", verified: "Progreso observado", review: "Sin verificar", failed: "Errores" },
  fr: { phase: ["En cours", "Aide nécessaire", "Contrôle humain", "Fermé"], actions: "Actions", verified: "Progrès observé", review: "Non vérifié", failed: "Échecs" },
  de: { phase: ["Arbeitet", "Braucht Hilfe", "Manuelle Steuerung", "Geschlossen"], actions: "Aktionen", verified: "Fortschritt", review: "Ungeprüft", failed: "Fehler" },
  pt: { phase: ["Em andamento", "Precisa de ajuda", "Controle humano", "Fechado"], actions: "Ações", verified: "Progresso", review: "Não verificado", failed: "Falhas" },
  ja: { phase: ["作業中", "支援が必要", "手動操作中", "終了"], actions: "操作", verified: "進捗確認", review: "未検証", failed: "失敗" },
  ko: { phase: ["작업 중", "도움 필요", "사용자 제어", "종료"], actions: "작업", verified: "진행 확인", review: "미확인", failed: "실패" },
  zh: { phase: ["进行中", "需要协助", "人工控制", "已关闭"], actions: "操作", verified: "已观察进度", review: "未验证", failed: "失败" },
  ru: { phase: ["Работает", "Нужна помощь", "Ручное управление", "Закрыто"], actions: "Действия", verified: "Прогресс", review: "Не проверено", failed: "Ошибки" },
  ar: { phase: ["قيد العمل", "بحاجة للمساعدة", "تحكم بشري", "مغلق"], actions: "الإجراءات", verified: "تقدم ملحوظ", review: "غير مؤكد", failed: "فشل" },
  hi: { phase: ["काम जारी", "मदद चाहिए", "मानवीय नियंत्रण", "बंद"], actions: "कार्रवाई", verified: "प्रगति", review: "असत्यापित", failed: "विफल" },
};
export function browserLoopLabels(lang: ActivityLanguage) { return LABELS[lang] ?? LABELS.en; }
export function browserLoopPhaseLabel(phase: string, language: ActivityLanguage): string {
  return browserLoopLabels(language).phase[
    phase === "needs_help" ? 1 : phase === "human_control" ? 2 : phase === "closed" ? 3 : 0];
}
