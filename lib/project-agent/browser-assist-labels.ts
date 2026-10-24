import type { ActivityLanguage } from "./activity-language";
type Actions = { take: string; release: string; type: string; send: string; up: string; down: string; help: string; click: string; open: string };
const words: Record<ActivityLanguage, Actions> = {
  en: {take:"Take control",release:"Hand back to Agent",type:"Type into selected field",send:"Enter text",up:"Scroll up",down:"Scroll down",help:"Click directly on the screenshot. Text goes only to the selected non-sensitive field.",click:"Manual control active",open:"Open Browser Preview"},
  vi: {take:"Tự thao tác",release:"Giao lại cho Agent",type:"Nhập vào ô đang chọn",send:"Nhập chữ",up:"Cuộn lên",down:"Cuộn xuống",help:"Nhấn trực tiếp trên ảnh web. Chữ chỉ được nhập vào ô không nhạy cảm đã chọn.",click:"Bạn đang điều khiển",open:"Mở Browser Preview"},
  es: {take:"Tomar el control",release:"Devolver al agente",type:"Escribir en el campo elegido",send:"Introducir texto",up:"Subir",down:"Bajar",help:"Pulsa la captura para interactuar.",click:"Control manual activo",open:"Abrir vista del navegador"},
  fr: {take:"Prendre le contrôle",release:"Rendre à l'agent",type:"Saisir dans le champ choisi",send:"Saisir",up:"Défiler vers le haut",down:"Défiler vers le bas",help:"Cliquez sur l'image pour interagir.",click:"Contrôle manuel actif",open:"Ouvrir l'aperçu du navigateur"},
  de: {take:"Übernehmen",release:"An Agent zurückgeben",type:"In ausgewähltes Feld eingeben",send:"Text eingeben",up:"Nach oben",down:"Nach unten",help:"Klicken Sie auf das Browserbild.",click:"Manuelle Steuerung aktiv",open:"Browser-Vorschau öffnen"},
  pt: {take:"Assumir controle",release:"Devolver ao agente",type:"Digitar no campo escolhido",send:"Inserir texto",up:"Rolar para cima",down:"Rolar para baixo",help:"Clique na imagem para interagir.",click:"Controle manual ativo",open:"Abrir prévia do navegador"},
  ja: {take:"操作を引き継ぐ",release:"エージェントに戻す",type:"選択した欄に入力",send:"入力",up:"上にスクロール",down:"下にスクロール",help:"画面をクリックして操作できます。",click:"手動操作中",open:"ブラウザープレビューを開く"},
  ko: {take:"직접 조작",release:"에이전트에 반환",type:"선택한 필드에 입력",send:"텍스트 입력",up:"위로 스크롤",down:"아래로 스크롤",help:"화면을 클릭해 조작하세요.",click:"수동 조작 중",open:"브라우저 미리보기 열기"},
  zh: {take:"接管操作",release:"交还给代理",type:"在所选输入框中输入",send:"输入文字",up:"向上滚动",down:"向下滚动",help:"点击画面直接操作。",click:"手动操作中",open:"打开浏览器预览"},
  ru: {take:"Взять управление",release:"Вернуть агенту",type:"Текст в выбранное поле",send:"Ввести",up:"Вверх",down:"Вниз",help:"Нажмите на снимок экрана для управления.",click:"Ручное управление",open:"Открыть браузер"},
  ar: {take:"تولي التحكم",release:"إعادة التحكم للوكيل",type:"أدخل النص في الحقل المختار",send:"إدخال النص",up:"تمرير لأعلى",down:"تمرير لأسفل",help:"انقر على الصورة للتحكم.",click:"التحكم اليدوي نشط",open:"فتح معاينة المتصفح"},
  hi: {take:"नियंत्रण लें",release:"एजेंट को सौंपें",type:"चुने हुए फ़ील्ड में लिखें",send:"टेक्स्ट डालें",up:"ऊपर स्क्रॉल",down:"नीचे स्क्रॉल",help:"चित्र पर क्लिक करके नियंत्रित करें।",click:"मैनुअल नियंत्रण सक्रिय",open:"ब्राउज़र प्रीव्यू खोलें"},
};
export function browserAssistText(language: ActivityLanguage): Actions { return words[language]; }
