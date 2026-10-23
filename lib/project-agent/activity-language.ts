/** A per-turn UI language hint. The model can write progress in any language;
 * deterministic fallback labels cover frequent locales without assuming Vietnamese. */
export type ActivityLanguage = "en" | "vi" | "es" | "fr" | "de" | "pt" | "ja" | "ko" | "zh" | "ru" | "ar" | "hi";
const patterns: Array<[ActivityLanguage, RegExp]> = [
  ["vi", /\b(?:tiếng việt|bằng tiếng việt|trả lời|hãy|giúp|mình|tôi|của|được|không|những|cho|với|đang|kiểm tra|tài liệu)\b/i],
  ["es", /\b(?:español|responde|quiero|necesito|por favor|gracias|puedes|archivo|proyecto)\b/i],
  ["fr", /\b(?:français|réponds|bonjour|merci|fichier|projet|pourquoi|comment|veuillez|besoin)\b/i],
  ["de", /\b(?:deutsch|bitte|danke|warum|ich|kannst|projekt|datei|erstelle)\b/i],
  ["pt", /\b(?:português|obrigado|preciso|você|arquivo|projeto|por favor|faça)\b/i],
];
export function projectAgentLanguage(prompt: string): ActivityLanguage {
  const text = prompt.slice(0, 3_000).toLowerCase();
  const explicit = [
    ["vi", /(?:trả lời|viết|respond|answer).{0,24}(?:tiếng việt|vietnamese)/],
    ["en", /(?:trả lời|viết|respond|answer).{0,24}(?:tiếng anh|english)/],
    ["ja", /(?:respond|answer|trả lời).{0,24}(?:japanese|tiếng nhật)/],
    ["fr", /(?:respond|answer|trả lời).{0,24}(?:french|français)/],
    ["es", /(?:respond|answer|trả lời).{0,24}(?:spanish|español)/],
    ["zh", /(?:respond|answer|trả lời).{0,24}(?:chinese|tiếng trung)/],
    ["ko", /(?:respond|answer|trả lời).{0,24}(?:korean|tiếng hàn)/],
  ] as const;
  for (const [language, regex] of explicit) if (regex.test(text)) return language;
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\uac00-\ud7af]/u.test(text)) return "ko";
  if (/[\u4e00-\u9fff]/u.test(text)) return "zh";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[\u0900-\u097f]/u.test(text)) return "hi";
  const scores = patterns.map(([lang, regex]) => [lang, (text.match(new RegExp(regex.source, "gi")) ?? []).length] as const);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0]?.[1] ? scores[0][0] : "en";
}

const translations: Record<ActivityLanguage, {
  working: string; completed: string; failed: string; thinking: string; review: string;
  search: string; read: string; write: string; run: string; calculate: string;
  tool: string; steps: string; sources: string; details: string; hide: string; skip: string;
}> = {
  en: { working:"Working on your request",completed:"Completed",failed:"Could not complete the task",thinking:"Deciding the next step",review:"Checking the output",search:"Searching for information",read:"Reading source material",write:"Creating or updating a file",run:"Running a task",calculate:"Calculating",tool:"Using a tool",steps:"steps",sources:"sources",details:"Show activity",hide:"Hide activity",skip:"Skip" },
  vi: { working:"Đang xử lý yêu cầu",completed:"Đã hoàn thành",failed:"Chưa thể hoàn thành",thinking:"Đang xác định bước tiếp theo",review:"Đang kiểm tra kết quả",search:"Đang tìm kiếm thông tin",read:"Đang đọc tài liệu",write:"Đang tạo hoặc cập nhật tệp",run:"Đang thực hiện tác vụ",calculate:"Đang tính toán",tool:"Đang dùng công cụ",steps:"bước",sources:"nguồn",details:"Xem hoạt động",hide:"Thu gọn",skip:"Bỏ qua" },
  es: { working:"Trabajando en tu solicitud",completed:"Completado",failed:"No se pudo completar",thinking:"Decidiendo el siguiente paso",review:"Revisando el resultado",search:"Buscando información",read:"Leyendo fuentes",write:"Creando o editando un archivo",run:"Ejecutando una tarea",calculate:"Calculando",tool:"Usando una herramienta",steps:"pasos",sources:"fuentes",details:"Ver actividad",hide:"Ocultar actividad",skip:"Omitir" },
  fr: { working:"Traitement de votre demande",completed:"Terminé",failed:"La tâche n'a pas abouti",thinking:"Choix de l'étape suivante",review:"Vérification du résultat",search:"Recherche d'informations",read:"Lecture des sources",write:"Création ou modification d'un fichier",run:"Exécution d'une tâche",calculate:"Calcul",tool:"Utilisation d'un outil",steps:"étapes",sources:"sources",details:"Voir l'activité",hide:"Masquer l'activité",skip:"Ignorer" },
  de: { working:"Anfrage wird bearbeitet",completed:"Abgeschlossen",failed:"Aufgabe nicht abgeschlossen",thinking:"Nächsten Schritt festlegen",review:"Ergebnis überprüfen",search:"Informationen suchen",read:"Quellen lesen",write:"Datei erstellen oder ändern",run:"Aufgabe ausführen",calculate:"Berechnen",tool:"Werkzeug verwenden",steps:"Schritte",sources:"Quellen",details:"Aktivität anzeigen",hide:"Aktivität ausblenden",skip:"Überspringen" },
  pt: { working:"Processando sua solicitação",completed:"Concluído",failed:"Não foi possível concluir",thinking:"Definindo o próximo passo",review:"Verificando o resultado",search:"Pesquisando informações",read:"Lendo fontes",write:"Criando ou editando arquivo",run:"Executando tarefa",calculate:"Calculando",tool:"Usando ferramenta",steps:"etapas",sources:"fontes",details:"Ver atividade",hide:"Ocultar atividade",skip:"Pular" },
  ja: { working:"リクエストを処理しています",completed:"完了しました",failed:"タスクを完了できませんでした",thinking:"次の手順を検討しています",review:"結果を確認しています",search:"情報を検索しています",read:"資料を読んでいます",write:"ファイルを作成・更新しています",run:"処理を実行しています",calculate:"計算しています",tool:"ツールを使用しています",steps:"ステップ",sources:"情報源",details:"作業を表示",hide:"作業を閉じる",skip:"スキップ" },
  ko: { working:"요청을 처리하고 있습니다",completed:"완료",failed:"작업을 완료하지 못했습니다",thinking:"다음 단계를 결정하고 있습니다",review:"결과를 확인하고 있습니다",search:"정보를 검색하고 있습니다",read:"자료를 읽고 있습니다",write:"파일을 만들거나 수정하고 있습니다",run:"작업을 실행하고 있습니다",calculate:"계산하고 있습니다",tool:"도구를 사용하고 있습니다",steps:"단계",sources:"출처",details:"활동 보기",hide:"활동 숨기기",skip:"건너뛰기" },
  zh: { working:"正在处理您的请求",completed:"已完成",failed:"未能完成任务",thinking:"正在决定下一步",review:"正在检查结果",search:"正在搜索信息",read:"正在阅读资料",write:"正在创建或更新文件",run:"正在执行任务",calculate:"正在计算",tool:"正在使用工具",steps:"步骤",sources:"来源",details:"查看活动",hide:"隐藏活动",skip:"跳过" },
  ru: { working:"Обработка запроса",completed:"Завершено",failed:"Не удалось завершить",thinking:"Выбор следующего шага",review:"Проверка результата",search:"Поиск информации",read:"Чтение источников",write:"Создание или изменение файла",run:"Выполнение задачи",calculate:"Вычисление",tool:"Использование инструмента",steps:"шагов",sources:"источников",details:"Показать действия",hide:"Скрыть действия",skip:"Пропустить" },
  ar: { working:"جارٍ معالجة طلبك",completed:"اكتمل",failed:"تعذر إكمال المهمة",thinking:"تحديد الخطوة التالية",review:"مراجعة النتيجة",search:"البحث عن معلومات",read:"قراءة المصادر",write:"إنشاء ملف أو تحديثه",run:"تنفيذ مهمة",calculate:"إجراء الحساب",tool:"استخدام أداة",steps:"خطوات",sources:"مصادر",details:"عرض النشاط",hide:"إخفاء النشاط",skip:"تخطي" },
  hi: { working:"आपके अनुरोध पर काम जारी है",completed:"पूरा हुआ",failed:"कार्य पूरा नहीं हुआ",thinking:"अगला कदम तय किया जा रहा है",review:"नतीजे की जाँच",search:"जानकारी खोजी जा रही है",read:"स्रोत पढ़े जा रहे हैं",write:"फ़ाइल बनाई या बदली जा रही है",run:"कार्य चल रहा है",calculate:"गणना हो रही है",tool:"टूल इस्तेमाल हो रहा है",steps:"चरण",sources:"स्रोत",details:"गतिविधि देखें",hide:"गतिविधि छिपाएँ",skip:"छोड़ें" },
};
export function activityText(language: ActivityLanguage) { return translations[language] ?? translations.en; }
export function activityLabel(tool: string, language: ActivityLanguage): string {
  const words = activityText(language);
  if (/search|arxiv|pubmed|wikipedia|recall/i.test(tool)) return words.search;
  if (/read|fetch|scraper|reference|markitdown|snapshot|extract/i.test(tool)) return words.read;
  if (/write|workspace_apply|create_|md_to_|json2excel|render_pages|render|generate_image/i.test(tool)) return words.write;
  if (/calculate/i.test(tool)) return words.calculate;
  if (/review|check|verif|screenshot/i.test(tool)) return words.review;
  if (/shell|wait|code|delegate|browser|workspace|pdf|transcribe/i.test(tool)) return words.run;
  return words.tool;
}
