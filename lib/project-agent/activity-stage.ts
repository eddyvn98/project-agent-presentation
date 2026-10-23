import type { ActivityLanguage } from "./activity-language";

export type AgentStage = "loading_context" | "preparing_inputs" | "processing_request" | "checking_output" | "saving_results";
const COPY: Record<ActivityLanguage, [string, string, string, string, string, string]> = {
  en: ["Gathering relevant Project context", "Preparing attached files and sources", "Processing the request", "Checking generated outputs", "Saving the result", "Tool returned a response"],
  vi: ["Đang thu thập ngữ cảnh liên quan trong Project", "Đang chuẩn bị tệp và nguồn tài liệu", "Đang xử lý yêu cầu", "Đang kiểm tra kết quả tạo ra", "Đang lưu kết quả", "Công cụ đã trả phản hồi"],
  es: ["Recopilando contexto del proyecto", "Preparando archivos y fuentes", "Procesando la solicitud", "Revisando los resultados", "Guardando el resultado", "La herramienta respondió"],
  fr: ["Collecte du contexte du projet", "Préparation des fichiers et sources", "Traitement de la demande", "Vérification des résultats", "Enregistrement du résultat", "L'outil a répondu"],
  de: ["Projektkontext wird zusammengestellt", "Dateien und Quellen werden vorbereitet", "Anfrage wird verarbeitet", "Ergebnisse werden geprüft", "Ergebnis wird gespeichert", "Werkzeug hat geantwortet"],
  pt: ["Reunindo o contexto do projeto", "Preparando arquivos e fontes", "Processando o pedido", "Verificando os resultados", "Salvando o resultado", "A ferramenta respondeu"],
  ja: ["プロジェクトの情報を収集中", "ファイルと資料を準備中", "リクエストを処理中", "結果を確認中", "結果を保存中", "ツールから応答を受信"],
  ko: ["프로젝트 관련 정보 수집 중", "파일과 자료 준비 중", "요청 처리 중", "결과 확인 중", "결과 저장 중", "도구 응답 수신"],
  zh: ["正在收集项目相关信息", "正在准备文件和资料", "正在处理请求", "正在检查生成结果", "正在保存结果", "已收到工具响应"],
  ru: ["Сбор контекста проекта", "Подготовка файлов и источников", "Обработка запроса", "Проверка результатов", "Сохранение результата", "Получен ответ инструмента"],
  ar: ["جمع سياق المشروع", "إعداد الملفات والمصادر", "معالجة الطلب", "مراجعة النتائج", "حفظ النتيجة", "تم استلام رد الأداة"],
  hi: ["प्रोजेक्ट संदर्भ एकत्र किया जा रहा है", "फ़ाइलें और स्रोत तैयार किए जा रहे हैं", "अनुरोध पर काम चल रहा है", "परिणाम जाँचे जा रहे हैं", "परिणाम सहेजा जा रहा है", "टूल से जवाब मिला"],
};
const KEYS: AgentStage[] = ["loading_context", "preparing_inputs", "processing_request", "checking_output", "saving_results"];
export function agentStageText(stage: string, language: ActivityLanguage): string | null {
  const index = KEYS.indexOf(stage as AgentStage);
  return index < 0 ? null : COPY[language][index];
}
export function agentToolReturnedText(language: ActivityLanguage): string {
  return COPY[language][5];
}
