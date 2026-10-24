import { activityText, type ActivityLanguage } from "./activity-language";

const VERBS: Record<ActivityLanguage, [string, string, string, string, string, string]> = {
  en: ["Opened a webpage", "Clicked an element", "Entered text", "Scrolled the page", "Changed browser tab", "Uploaded a file"],
  vi: ["Đã mở trang web", "Đã nhấn phần tử", "Đã nhập nội dung", "Đã cuộn trang", "Đã chuyển tab trình duyệt", "Đã chọn tệp tải lên"],
  es: ["Página abierta", "Elemento pulsado", "Texto introducido", "Página desplazada", "Pestaña cambiada", "Archivo seleccionado"],
  fr: ["Page ouverte", "Élément cliqué", "Texte saisi", "Page défilée", "Onglet modifié", "Fichier sélectionné"],
  de: ["Webseite geöffnet", "Element angeklickt", "Text eingegeben", "Seite gescrollt", "Browser-Tab gewechselt", "Datei ausgewählt"],
  pt: ["Página aberta", "Elemento clicado", "Texto inserido", "Página rolada", "Aba alterada", "Arquivo selecionado"],
  ja: ["ページを開きました", "要素をクリックしました", "テキストを入力しました", "画面をスクロールしました", "タブを切り替えました", "ファイルを選択しました"],
  ko: ["웹페이지를 열었습니다", "요소를 클릭했습니다", "텍스트를 입력했습니다", "페이지를 스크롤했습니다", "탭을 전환했습니다", "파일을 선택했습니다"],
  zh: ["已打开网页", "已点击元素", "已输入内容", "已滚动页面", "已切换标签页", "已选择文件"],
  ru: ["Веб-страница открыта", "Элемент нажат", "Текст введён", "Страница прокручена", "Вкладка переключена", "Файл выбран"],
  ar: ["تم فتح الصفحة", "تم النقر على العنصر", "تم إدخال النص", "تم تمرير الصفحة", "تم تغيير التبويب", "تم اختيار ملف"],
  hi: ["वेबपेज खोला गया", "तत्व क्लिक किया गया", "पाठ दर्ज किया गया", "पेज स्क्रॉल किया गया", "टैब बदला गया", "फ़ाइल चुनी गई"],
};

export function browserActionLabel(action: string, language: ActivityLanguage): string {
  const index = action === "open" ? 0 : action === "click" ? 1 : action === "type" ? 2
    : action === "scroll" ? 3 : /tab/.test(action) ? 4 : action === "upload" ? 5 : -1;
  return index < 0 ? activityText(language).run : VERBS[language][index];
}
